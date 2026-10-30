import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { ReminderRepository } from '../src/main/reminder-repository';
import { ReminderScheduler } from '../src/main/reminder-scheduler';

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  }
});

function path() {
  const value = join(tmpdir(), `${randomUUID()}.sqlite`);
  paths.push(value);
  return value;
}

function createDueTask(database: ReturnType<typeof createDatabase>, now: Date) {
  const tasks = new TaskRepository(database, { clock: () => now, timeZone: 'Asia/Shanghai' });
  const task = tasks.create('写周报');
  return tasks.update(task.id, { dueDate: '2026-10-28' }, task.revision);
}

describe('reminder integration', () => {
  it('does not replay a plan missed while the app was closed', async () => {
    const file = path();
    const beforeClose = new Date('2026-10-28T01:00:00.000Z');
    const database = createDatabase(file);
    const task = createDueTask(database, beforeClose);
    new ReminderRepository(database, { clock: () => beforeClose })
      .upsertForTask(task.id, new Date('2026-10-28T01:30:00.000Z'), 'Asia/Shanghai');
    database.close();

    const reopened = createDatabase(file);
    const now = new Date('2026-10-28T02:00:00.000Z');
    const reminders = new ReminderRepository(reopened, { clock: () => now });
    const onDue = vi.fn();
    const scheduler = new ReminderScheduler(reminders, onDue, { clock: () => now, sessionStartedAt: now });
    scheduler.start();
    await scheduler.poll(now);
    expect(onDue).not.toHaveBeenCalled();
    expect(reminders.getForTask(task.id).status).toBe('missed');
    scheduler.stop();
    reopened.close();
  });

  it('allows only one scheduler to emit a concurrently due plan', async () => {
    const database = createDatabase(':memory:');
    const now = new Date('2026-10-28T01:00:00.000Z');
    const task = createDueTask(database, now);
    const reminders = new ReminderRepository(database, { clock: () => now });
    reminders.upsertForTask(task.id, new Date('2026-10-28T00:30:00.000Z'), 'Asia/Shanghai');
    const first = vi.fn();
    const second = vi.fn();
    const a = new ReminderScheduler(reminders, first, { clock: () => now });
    const b = new ReminderScheduler(reminders, second, { clock: () => now });
    await Promise.all([a.poll(now), b.poll(now)]);
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
    database.close();
  });

  it('never emits for a completed task even with a stale scheduled plan', async () => {
    const database = createDatabase(':memory:');
    const now = new Date('2026-10-28T01:00:00.000Z');
    const task = createDueTask(database, now);
    const reminders = new ReminderRepository(database, { clock: () => now });
    reminders.upsertForTask(task.id, new Date('2026-10-28T00:30:00.000Z'), 'Asia/Shanghai');
    const tasks = new TaskRepository(database, { clock: () => now, timeZone: 'Asia/Shanghai' });
    tasks.complete(task.id, task.revision);
    const onDue = vi.fn();
    await new ReminderScheduler(reminders, onDue, { clock: () => now }).poll(now);
    expect(onDue).not.toHaveBeenCalled();
    database.close();
  });
});
