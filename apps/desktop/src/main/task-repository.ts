import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  errorCodeSchema,
  parsedTaskSchema,
  rawTextSchema,
  taskPatchSchema,
  taskSchema,
  type ErrorCode,
  type ParseStatus,
  type ParsedTask,
  type Task,
  type TaskPatch,
} from '@acenote/contracts';

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
}

function toTask(row: TaskRow): Task {
  return taskSchema.parse({
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
  });
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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

  create(rawInput: string): Task {
    const rawText = rawTextSchema.parse(rawInput);
    const id = this.idGenerator();
    const now = this.clock().toISOString();
    const recordDate = localDate(this.clock(), this.timeZone);
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO tasks (
          id, raw_text, title, recorded_at, record_date, due_date, due_time,
          time_zone, contact, parse_status, parse_error, created_at, updated_at, edited_at, revision
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL, 'pending', NULL, ?, ?, NULL, 0)
        ON CONFLICT(id) DO NOTHING
      `).run(id, rawText, rawText.slice(0, 200), now, recordDate, this.timeZone, now, now);
    })();
    return this.get(id);
  }

  list(): Task[] {
    const rows = this.database.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC').all() as TaskRow[];
    return rows.map(toTask);
  }

  get(id: string): Task {
    const row = this.database.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!row) throw new Error('NOT_FOUND');
    return toTask(row);
  }

  update(id: string, input: TaskPatch, expectedRevision: number): Task {
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

  setParseStatus(id: string, status: ParseStatus, error: ErrorCode | null = null): Task {
    this.database.prepare('UPDATE tasks SET parse_status = ?, parse_error = ?, updated_at = ? WHERE id = ?')
      .run(status, error, this.clock().toISOString(), id);
    return this.get(id);
  }

  applyParseResult(id: string, expectedRevision: number, input: ParsedTask): Task | null {
    const result = parsedTaskSchema.parse(input);
    const updated = this.database.prepare(`
      UPDATE tasks SET title = ?, due_date = ?, due_time = ?, contact = ?,
        parse_status = 'succeeded', parse_error = NULL, updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ?
    `).run(result.title, result.dueDate, result.dueTime, result.contact, this.clock().toISOString(), id, expectedRevision);
    return updated.changes === 0 ? null : this.get(id);
  }
}
