import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ParseIntentResult } from '@acenote/contracts';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { IntakeRepository } from '../src/main/intake-repository';
import { ReminderRepository } from '../src/main/reminder-repository';
import { ReminderService } from '../src/main/reminder-service';
import { LifecycleService } from '../src/main/lifecycle-service';
import { ReminderScheduler } from '../src/main/reminder-scheduler';

let database: Database.Database;
let tasks: TaskRepository;
let reminders: ReminderRepository;
let intakes: IntakeRepository;
const now = new Date('2026-10-28T01:00:00.000Z');
const intent: ParseIntentResult = {
  intent: 'create',
  task: {
    title: '写周报',
    dueDate: '2026-10-28',
    dueTime: '15:30',
    contact: null,
  },
};

beforeEach(() => {
  database = createDatabase(':memory:');
  tasks = new TaskRepository(database, {
    clock: () => now,
    timeZone: 'Asia/Shanghai',
  });
  intakes = new IntakeRepository(database, {
    clock: () => now,
    timeZone: 'Asia/Shanghai',
    idGenerator: randomUUID,
  });
  reminders = new ReminderRepository(database, { clock: () => now });
});
afterEach(() => database.close());

function serviceWith(
  reminderSync: { syncTask: (taskId: string) => void } = new ReminderService(
    tasks,
    reminders,
    { clock: () => now },
  ),
) {
  return new LifecycleService(tasks, intakes, async () => intent, reminderSync);
}

describe('reminder lifecycle linkage', () => {
  it('cancels the existing reminder when manually completing without a model call', async () => {
    const task = tasks.create('吃饭');
    const scheduled = tasks.update(
      task.id,
      { dueDate: '2026-10-28', dueTime: '12:00' },
      task.revision,
    );
    const reminderService = new ReminderService(tasks, reminders, {
      clock: () => now,
    });
    reminderService.syncTask(scheduled.id);
    expect(reminders.getForTask(scheduled.id).status).toBe('scheduled');
    const parser = vi.fn();
    const service = new LifecycleService(
      tasks,
      intakes,
      parser,
      reminderService,
    );
    const completed = await service.completeTask(
      scheduled.id,
      scheduled.revision,
    );
    expect(completed.status).toBe('completed');
    expect(reminders.getForTask(completed.id).status).toBe('cancelled');
    expect(tasks.dailyCompletionSummary('2026-10-28').completedCount).toBe(1);
    expect(parser).not.toHaveBeenCalled();
  });
  it('stores a parsed time-only task and fires its today reminder once', async () => {
    let clock = new Date('2026-10-30T03:00:00Z');
    const repository = new TaskRepository(database, {
      clock: () => clock,
      timeZone: 'Asia/Shanghai',
    });
    const intakeRepository = new IntakeRepository(database, {
      clock: () => clock,
      timeZone: 'Asia/Shanghai',
    });
    const reminderRepository = new ReminderRepository(database, {
      clock: () => clock,
    });
    const service = new LifecycleService(
      repository,
      intakeRepository,
      async () => ({
        intent: 'create',
        task: {
          title: '吃饭',
          dueDate: '2026-10-30',
          dueTime: '12:00',
          contact: null,
        },
      }),
      new ReminderService(repository, reminderRepository, {
        clock: () => clock,
      }),
    );
    const outcome = await service.submitInput('12点钟提醒我吃饭');
    if (outcome.kind !== 'task') throw new Error('expected task');
    expect(outcome.task).toMatchObject({
      rawText: '12点钟提醒我吃饭',
      title: '吃饭',
      dueDate: '2026-10-30',
      dueTime: '12:00',
      recordedAt: clock.toISOString(),
    });
    expect(reminderRepository.getForTask(outcome.task.id)).toMatchObject({
      scheduledAt: '2026-10-30T04:00:00.000Z',
      status: 'scheduled',
    });
    const onDue = vi.fn();
    const scheduler = new ReminderScheduler(reminderRepository, onDue, {
      clock: () => clock,
    });
    await scheduler.poll();
    expect(onDue).not.toHaveBeenCalled();
    clock = new Date('2026-10-30T04:00:00Z');
    await scheduler.poll();
    await scheduler.poll();
    expect(onDue).toHaveBeenCalledOnce();
    expect(onDue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '吃饭',
        dueDate: '2026-10-30',
        dueTime: '12:00',
      }),
    );
  });
  it('preserves a past today time without scheduling tomorrow or replaying a reminder', async () => {
    const clock = new Date('2026-10-30T05:00:00Z');
    const repository = new TaskRepository(database, {
      clock: () => clock,
      timeZone: 'Asia/Shanghai',
    });
    const intakeRepository = new IntakeRepository(database, {
      clock: () => clock,
      timeZone: 'Asia/Shanghai',
    });
    const reminderRepository = new ReminderRepository(database, {
      clock: () => clock,
    });
    const service = new LifecycleService(
      repository,
      intakeRepository,
      async () => ({
        intent: 'create',
        task: {
          title: '吃饭',
          dueDate: '2026-10-30',
          dueTime: '12:00',
          contact: null,
        },
      }),
      new ReminderService(repository, reminderRepository, {
        clock: () => clock,
      }),
    );
    const outcome = await service.submitInput('12点吃饭');
    if (outcome.kind !== 'task') throw new Error('expected task');
    expect(outcome.task).toMatchObject({
      dueDate: '2026-10-30',
      dueTime: '12:00',
    });
    expect(() => reminderRepository.getForTask(outcome.task.id)).toThrow(
      'NOT_FOUND',
    );
  });
  it('schedules on create, cancels on complete, and reschedules on restore', async () => {
    const service = serviceWith();
    const outcome = await service.submitInput('明天下午三点半写周报');
    if (outcome.kind !== 'task') throw new Error('expected task');
    expect(reminders.getForTask(outcome.task.id)).toMatchObject({
      status: 'scheduled',
      scheduledAt: '2026-10-28T07:30:00.000Z',
    });
    const completed = await service.selectCandidate({
      intakeId: outcome.intakeId,
      taskId: outcome.task.id,
      revision: outcome.task.revision,
    });
    expect(reminders.getForTask(completed.id).status).toBe('cancelled');
    const restored = await service.restoreTask(
      completed.id,
      completed.revision,
    );
    expect(reminders.getForTask(restored.id).status).toBe('scheduled');
  });

  it('does not schedule a past due time', () => {
    const task = tasks.create('过去事项');
    const updated = tasks.update(
      task.id,
      { dueDate: '2026-10-27' },
      task.revision,
    );
    new ReminderService(tasks, reminders, { clock: () => now }).syncTask(
      updated.id,
    );
    expect(() => reminders.getForTask(updated.id)).toThrow('NOT_FOUND');
  });

  it('does not block task creation when reminder sync fails', async () => {
    const failing = {
      syncTask: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    };
    const service = serviceWith(failing);
    const outcome = await service.submitInput('明天下午三点半写周报');
    expect(outcome.kind).toBe('task');
  });
});
