import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  errorCodeSchema,
  lifecycleTaskSchema,
  parsedTaskSchema,
  rawTextSchema,
  taskPatchSchema,
  type ErrorCode,
  type LifecycleTask,
  type ParseStatus,
  type ParsedTask,
  type TaskPatch,
  type TaskStatus,
  type TaskStatusFilter,
} from '@acenote/contracts';
import { localDate } from './local-date';

interface RepositoryOptions {
  clock?: () => Date;
  idGenerator?: () => string;
  timeZone?: string;
}

interface TaskRow {
  id: string;
  raw_text: string;
  title: string;
  recorded_at: string;
  record_date: string;
  due_date: string | null;
  due_time: string | null;
  time_zone: string;
  contact: string | null;
  parse_status: ParseStatus;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  revision: number;
  status: TaskStatus;
  completed_at: string | null;
  completion_date: string | null;
  completion_time_zone: string | null;
  archived_at: string | null;
}

function toTask(row: TaskRow): LifecycleTask {
  return lifecycleTaskSchema.parse({
    id: row.id,
    rawText: row.raw_text,
    title: row.title,
    recordedAt: row.recorded_at,
    recordDate: row.record_date,
    dueDate: row.due_date,
    dueTime: row.due_time,
    timeZone: row.time_zone,
    contact: row.contact,
    parseStatus: row.parse_status,
    parseError: row.parse_error ? errorCodeSchema.parse(row.parse_error) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    revision: row.revision,
    status: row.status,
    completedAt: row.completed_at,
    completionDate: row.completion_date,
    completionTimeZone: row.completion_time_zone,
    archivedAt: row.archived_at,
  });
}

export class TaskRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly timeZone: string;

  constructor(private readonly database: Database.Database, options: RepositoryOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  create(rawInput: string, options: { id?: string; recordedAt?: Date; timeZone?: string } = {}): LifecycleTask {
    const rawText = rawTextSchema.parse(rawInput);
    const id = options.id ?? this.idGenerator();
    const timeZone = options.timeZone ?? this.timeZone;
    const recordedAt = options.recordedAt ?? this.clock();
    const now = recordedAt.toISOString();
    const recordDate = localDate(recordedAt, timeZone);
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO tasks (
          id, raw_text, title, recorded_at, record_date, due_date, due_time,
          time_zone, contact, parse_status, parse_error, created_at, updated_at, edited_at, revision
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL, 'pending', NULL, ?, ?, NULL, 0)
        ON CONFLICT(id) DO NOTHING
      `).run(id, rawText, rawText.slice(0, 200), now, recordDate, timeZone, now, now);
    })();
    return this.get(id);
  }

  list(): LifecycleTask[] {
    const rows = this.database.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC').all() as TaskRow[];
    return rows.map(toTask);
  }

  get(id: string): LifecycleTask {
    const row = this.database.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!row) throw new Error('NOT_FOUND');
    return toTask(row);
  }

  listByRecordDate(date: string, status: TaskStatusFilter = 'all'): LifecycleTask[] {
    const rows = status === 'all'
      ? this.database.prepare('SELECT * FROM tasks WHERE record_date = ? ORDER BY created_at DESC, id DESC').all(date)
      : this.database.prepare('SELECT * FROM tasks WHERE record_date = ? AND status = ? ORDER BY created_at DESC, id DESC').all(date, status);
    return (rows as TaskRow[]).map(toTask);
  }

  dailyCompletionSummary(date: string): { date: string; completedCount: number } {
    const row = this.database.prepare(
      "SELECT COUNT(*) AS count FROM tasks WHERE status = 'completed' AND completion_date = ?",
    ).get(date) as { count: number };
    return { date, completedCount: row.count };
  }

  update(id: string, input: TaskPatch, expectedRevision: number): LifecycleTask {
    const patch = taskPatchSchema.parse(input);
    const current = this.get(id);
    if (current.revision !== expectedRevision) throw new Error('CONCURRENT_EDIT');
    const merged = parsedTaskSchema.parse({
      title: patch.title ?? current.title,
      dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
      dueTime: patch.dueTime === undefined ? current.dueTime : patch.dueTime,
      contact: patch.contact === undefined ? current.contact : patch.contact,
    });
    const now = this.clock().toISOString();
    const result = this.database.prepare(`
      UPDATE tasks SET title = ?, due_date = ?, due_time = ?, contact = ?,
        edited_at = ?, updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ?
    `).run(merged.title, merged.dueDate, merged.dueTime, merged.contact, now, now, id, expectedRevision);
    if (result.changes === 0) throw new Error('CONCURRENT_EDIT');
    return this.get(id);
  }

  setParseStatus(id: string, status: ParseStatus, error: ErrorCode | null = null): LifecycleTask {
    this.database.prepare('UPDATE tasks SET parse_status = ?, parse_error = ?, updated_at = ? WHERE id = ?')
      .run(status, error, this.clock().toISOString(), id);
    return this.get(id);
  }

  applyParseResult(id: string, expectedRevision: number, input: ParsedTask): LifecycleTask | null {
    const result = parsedTaskSchema.parse(input);
    const updated = this.database.prepare(`
      UPDATE tasks SET title = ?, due_date = ?, due_time = ?, contact = ?,
        parse_status = 'succeeded', parse_error = NULL, updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ?
    `).run(result.title, result.dueDate, result.dueTime, result.contact, this.clock().toISOString(), id, expectedRevision);
    return updated.changes === 0 ? null : this.get(id);
  }

  complete(id: string, expectedRevision: number): LifecycleTask {
    const current = this.get(id);
    if (current.status !== 'open') throw new Error('INVALID_TRANSITION');
    if (current.revision !== expectedRevision) throw new Error('CONCURRENT_EDIT');
    const now = new Date(this.clock());
    const changed = this.database.prepare(`
      UPDATE tasks SET status = 'completed', completed_at = ?, completion_date = ?,
        completion_time_zone = ?, updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ? AND status = 'open'
    `).run(now.toISOString(), localDate(now, this.timeZone), this.timeZone, now.toISOString(), id, expectedRevision);
    if (changed.changes === 0) throw new Error('CONCURRENT_EDIT');
    return this.get(id);
  }

  archive(id: string, expectedRevision: number): LifecycleTask {
    const current = this.get(id);
    if (current.status !== 'open') throw new Error('INVALID_TRANSITION');
    if (current.revision !== expectedRevision) throw new Error('CONCURRENT_EDIT');
    const now = this.clock().toISOString();
    const changed = this.database.prepare(`
      UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ? AND status = 'open'
    `).run(now, now, id, expectedRevision);
    if (changed.changes === 0) throw new Error('CONCURRENT_EDIT');
    return this.get(id);
  }

  restore(id: string, expectedRevision: number): LifecycleTask {
    const current = this.get(id);
    if (current.status === 'open') throw new Error('INVALID_TRANSITION');
    if (current.revision !== expectedRevision) throw new Error('CONCURRENT_EDIT');
    const now = this.clock().toISOString();
    const changed = this.database.prepare(`
      UPDATE tasks SET status = 'open', completed_at = NULL, completion_date = NULL,
        completion_time_zone = NULL, archived_at = NULL, updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ? AND status = ?
    `).run(now, id, expectedRevision, current.status);
    if (changed.changes === 0) throw new Error('CONCURRENT_EDIT');
    return this.get(id);
  }
}
