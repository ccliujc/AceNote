import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { ReminderRepository } from '../src/main/reminder-repository';
import { ReminderScheduler } from '../src/main/reminder-scheduler';

let database: Database.Database;
let tasks: TaskRepository;
let reminders: ReminderRepository;
const sessionStart = new Date('2026-10-28T01:00:00.000Z');

beforeEach(() => {
  database = createDatabase(':memory:');
  tasks = new TaskRepository(database, { clock: () => sessionStart, timeZone: 'Asia/Shanghai' });
  reminders = new ReminderRepository(database, { clock: () => sessionStart });
});
afterEach(() => {
  database.close();
  vi.useRealTimers();
});

function dueTask(title: string) {
  const task = tasks.create(title);
  return tasks.update(task.id, { dueDate: '2026-10-28' }, task.revision);
}

describe('ReminderScheduler', () => {
  it('marks plans before session start as missed and does not emit them', async () => {
    const task = dueTask('旧提醒');
    reminders.upsertForTask(task.id, new Date('2026-10-28T00:30:00Z'), 'Asia/Shanghai');
    const onDue = vi.fn();
    const scheduler = new ReminderScheduler(reminders, onDue, { clock: () => sessionStart, sessionStartedAt: sessionStart });
    scheduler.start();
    await scheduler.poll(new Date('2026-10-28T02:00:00Z'));
    expect(onDue).not.toHaveBeenCalled();
    expect(reminders.getForTask(task.id).status).toBe('missed');
    scheduler.stop();
  });

  it('emits one due reminder and does not duplicate on polling', async () => {
    const task = dueTask('写周报');
    reminders.upsertForTask(task.id, new Date('2026-10-28T01:30:00Z'), 'Asia/Shanghai');
    const onDue = vi.fn();
    const scheduler = new ReminderScheduler(reminders, onDue, { clock: () => sessionStart, sessionStartedAt: sessionStart });
    scheduler.start();
    await scheduler.poll(new Date('2026-10-28T02:00:00Z'));
    await scheduler.poll(new Date('2026-10-28T02:01:00Z'));
    expect(onDue).toHaveBeenCalledOnce();
    expect(onDue.mock.calls[0]![0]).toMatchObject({ title: '写周报', dueDate: '2026-10-28' });
    scheduler.stop();
  });

  it('stops its timer and ignores emitter errors for later reminders', async () => {
    const first = dueTask('先提醒');
    const second = dueTask('后提醒');
    reminders.upsertForTask(first.id, new Date('2026-10-28T01:10:00Z'), 'Asia/Shanghai');
    reminders.upsertForTask(second.id, new Date('2026-10-28T01:20:00Z'), 'Asia/Shanghai');
    const onDue = vi.fn().mockImplementationOnce(() => { throw new Error('renderer gone'); });
    const scheduler = new ReminderScheduler(reminders, onDue, { clock: () => sessionStart, sessionStartedAt: sessionStart, intervalMs: 1000 });
    vi.useFakeTimers();
    scheduler.start();
    await scheduler.poll(new Date('2026-10-28T02:00:00Z'));
    expect(onDue).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
