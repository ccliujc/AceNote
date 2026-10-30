import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { ReminderRepository } from '../src/main/reminder-repository';

let database: Database.Database;
let tasks: TaskRepository;
let reminders: ReminderRepository;
const now = new Date('2026-10-28T01:00:00.000Z');

beforeEach(() => {
  database = createDatabase(':memory:');
  tasks = new TaskRepository(database, { clock: () => now, timeZone: 'Asia/Shanghai' });
  reminders = new ReminderRepository(database, { clock: () => now });
});
afterEach(() => database.close());

function createDueTask(title: string) {
  const task = tasks.create(title);
  return tasks.update(task.id, { dueDate: '2026-10-28' }, task.revision);
}

describe('ReminderRepository', () => {
  it('keeps one plan per task and updates scheduling', () => {
    const task = createDueTask('写周报');
    const first = reminders.upsertForTask(task.id, new Date('2026-10-28T02:00:00Z'), 'Asia/Shanghai');
    const second = reminders.upsertForTask(task.id, new Date('2026-10-28T03:00:00Z'), 'Asia/Shanghai');
    expect(second.id).toBe(first.id);
    expect((database.prepare('SELECT COUNT(*) AS count FROM reminders').get() as { count: number }).count).toBe(1);
    expect(second.scheduledAt).toBe('2026-10-28T03:00:00.000Z');
  });

  it('cancels and marks missed plans without firing them', () => {
    const task = createDueTask('写周报');
    reminders.upsertForTask(task.id, new Date('2026-10-28T00:00:00Z'), 'Asia/Shanghai');
    expect(reminders.markMissedBefore(now)).toBe(1);
    expect(reminders.listDue(now)).toHaveLength(0);
    expect(reminders.getForTask(task.id).status).toBe('missed');
    reminders.cancel(task.id);
    expect(reminders.getForTask(task.id).status).toBe('missed');
  });

  it('claims a due open task only once', () => {
    const task = createDueTask('写周报');
    reminders.upsertForTask(task.id, new Date('2026-10-27T23:00:00Z'), 'Asia/Shanghai');
    const due = reminders.listDue(now);
    expect(due).toHaveLength(1);
    expect(reminders.claim(due[0]!.id)?.title).toBe('写周报');
    expect(reminders.claim(due[0]!.id)).toBeNull();
    expect(reminders.listActive()).toHaveLength(1);
  });

  it('does not deliver reminders for completed tasks', () => {
    const task = createDueTask('写周报');
    reminders.upsertForTask(task.id, new Date('2026-10-27T23:00:00Z'), 'Asia/Shanghai');
    tasks.complete(task.id, task.revision);
    expect(reminders.listDue(now)).toHaveLength(0);
  });
});
