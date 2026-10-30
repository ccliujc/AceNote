import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { reminderSchema, reminderViewSchema, type Reminder, type ReminderView } from '@acenote/contracts';

interface ReminderOptions {
  clock?: () => Date;
  idGenerator?: () => string;
}

interface ReminderRow {
  id: string;
  task_id: string;
  scheduled_at: string;
  time_zone: string;
  status: Reminder['status'];
  fired_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DueRow extends ReminderRow {
  title: string;
  due_date: string;
  due_time: string | null;
}

function toReminder(row: ReminderRow): Reminder {
  return reminderSchema.parse({
    id: row.id,
    taskId: row.task_id,
    scheduledAt: row.scheduled_at,
    timeZone: row.time_zone,
    status: row.status,
    firedAt: row.fired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class ReminderRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly database: Database.Database, options: ReminderOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  upsertForTask(taskId: string, scheduledAt: Date, timeZone: string): Reminder {
    const now = this.clock().toISOString();
    this.database.prepare(`
      INSERT INTO reminders (id, task_id, scheduled_at, time_zone, status, fired_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'scheduled', NULL, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET scheduled_at = excluded.scheduled_at,
        time_zone = excluded.time_zone, status = 'scheduled', fired_at = NULL, updated_at = excluded.updated_at
    `).run(this.idGenerator(), taskId, scheduledAt.toISOString(), timeZone, now, now);
    return this.getForTask(taskId);
  }

  getForTask(taskId: string): Reminder {
    const row = this.database.prepare('SELECT * FROM reminders WHERE task_id = ?').get(taskId) as ReminderRow | undefined;
    if (!row) throw new Error('NOT_FOUND');
    return toReminder(row);
  }

  cancel(taskId: string): void {
    const now = this.clock().toISOString();
    this.database.prepare("UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE task_id = ? AND status = 'scheduled'")
      .run(now, taskId);
  }

  markMissedBefore(cutoff: Date): number {
    const now = this.clock().toISOString();
    return this.database.prepare("UPDATE reminders SET status = 'missed', updated_at = ? WHERE status = 'scheduled' AND scheduled_at < ?")
      .run(now, cutoff.toISOString()).changes;
  }

  listDue(now: Date): ReminderView[] {
    const rows = this.database.prepare(`
      SELECT r.*, t.title, t.due_date, t.due_time FROM reminders r
      JOIN tasks t ON t.id = r.task_id
      WHERE r.status = 'scheduled' AND r.scheduled_at <= ? AND t.status = 'open'
      ORDER BY r.scheduled_at ASC, r.id ASC
    `).all(now.toISOString()) as DueRow[];
    return rows.map((row) => reminderViewSchema.parse({
      id: row.id,
      taskId: row.task_id,
      title: row.title,
      dueDate: row.due_date,
      dueTime: row.due_time,
      scheduledAt: row.scheduled_at,
    }));
  }

  claim(id: string): ReminderView | null {
    const now = this.clock().toISOString();
    const changed = this.database.prepare("UPDATE reminders SET status = 'fired', fired_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'")
      .run(now, now, id);
    if (changed.changes === 0) return null;
    const row = this.database.prepare(`
      SELECT r.*, t.title, t.due_date, t.due_time FROM reminders r JOIN tasks t ON t.id = r.task_id WHERE r.id = ?
    `).get(id) as DueRow;
    return reminderViewSchema.parse({
      id: row.id, taskId: row.task_id, title: row.title,
      dueDate: row.due_date, dueTime: row.due_time, scheduledAt: row.scheduled_at,
    });
  }

  listActive(): ReminderView[] {
    const rows = this.database.prepare(`
      SELECT r.*, t.title, t.due_date, t.due_time FROM reminders r JOIN tasks t ON t.id = r.task_id
      WHERE r.status = 'fired' ORDER BY r.scheduled_at ASC, r.id ASC
    `).all() as DueRow[];
    return rows.map((row) => reminderViewSchema.parse({
      id: row.id, taskId: row.task_id, title: row.title,
      dueDate: row.due_date, dueTime: row.due_time, scheduledAt: row.scheduled_at,
    }));
  }
}
