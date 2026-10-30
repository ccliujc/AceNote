import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ParseIntentResult } from '@acenote/contracts';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { IntakeRepository } from '../src/main/intake-repository';
import { ParseClientError } from '../src/main/parse-queue';
import { LifecycleService } from '../src/main/lifecycle-service';

let database: Database.Database;
let tasks: TaskRepository;
let intakes: IntakeRepository;
const now = new Date('2026-10-28T01:00:00.000Z');
const createIntent: ParseIntentResult = {
  intent: 'create',
  task: { title: '写周报', dueDate: null, dueTime: null, contact: null },
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
});
afterEach(() => database.close());

function serviceWith(client: () => Promise<ParseIntentResult>) {
  return new LifecycleService(tasks, intakes, client);
}

describe('LifecycleService', () => {
  it('completes the exact clicked ID without AI or an intake and emits only once', async () => {
    const first = tasks.create('写周报');
    const second = tasks.create('写周报');
    const parser = vi.fn();
    const syncTask = vi.fn();
    const onCompleted = vi.fn(),
      onChanged = vi.fn();
    const service = new LifecycleService(
      tasks,
      intakes,
      parser,
      { syncTask },
      { onCompleted, onChanged },
    );
    const result = await service.completeTask(second.id, second.revision);
    expect(result).toMatchObject({
      status: 'completed',
      completedAt: now.toISOString(),
      completionDate: '2026-10-28',
      recordedAt: second.recordedAt,
      rawText: second.rawText,
    });
    expect(tasks.get(first.id).status).toBe('open');
    expect(tasks.dailyCompletionSummary('2026-10-28').completedCount).toBe(1);
    expect(parser).not.toHaveBeenCalled();
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM intake_events').get(),
    ).toEqual({ count: 0 });
    expect(syncTask).toHaveBeenCalledExactlyOnceWith(second.id);
    expect(onCompleted).toHaveBeenCalledExactlyOnceWith(result);
    expect(onChanged).toHaveBeenCalledExactlyOnceWith('completed');
    await expect(
      service.completeTask(second.id, second.revision),
    ).rejects.toThrow('INVALID_TRANSITION');
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledOnce();
  });
  it('rejects stale or archived tasks without completion events or reminder changes', async () => {
    const task = tasks.create('旧标题');
    const updated = tasks.update(task.id, { title: '新标题' }, task.revision);
    const archived = tasks.archive(updated.id, updated.revision);
    const open = tasks.create('待办');
    const changed = tasks.update(open.id, { title: '已编辑' }, open.revision);
    const parser = vi.fn(),
      syncTask = vi.fn(),
      onCompleted = vi.fn(),
      onChanged = vi.fn();
    const service = new LifecycleService(
      tasks,
      intakes,
      parser,
      { syncTask },
      { onCompleted, onChanged },
    );
    await expect(service.completeTask(open.id, open.revision)).rejects.toThrow(
      'CONCURRENT_EDIT',
    );
    await expect(
      service.completeTask(archived.id, archived.revision),
    ).rejects.toThrow('INVALID_TRANSITION');
    expect(tasks.get(changed.id)).toMatchObject({
      status: 'open',
      revision: changed.revision,
    });
    expect(tasks.dailyCompletionSummary('2026-10-28').completedCount).toBe(0);
    for (const spy of [parser, syncTask, onCompleted, onChanged])
      expect(spy).not.toHaveBeenCalled();
  });
  it('creates a task from intake using the same UUID and receive time', async () => {
    const service = serviceWith(async () => createIntent);
    const outcome = await service.submitInput('写周报');
    expect(outcome.kind).toBe('task');
    if (outcome.kind !== 'task') return;
    expect(outcome.task).toMatchObject({
      id: outcome.intakeId,
      status: 'open',
      title: '写周报',
      recordedAt: now.toISOString(),
    });
    expect(intakes.get(outcome.intakeId).status).toBe('resolved');
  });

  it('completes a unique open match with completion metadata', async () => {
    tasks.create('写周报');
    const service = serviceWith(async () => ({
      intent: 'complete',
      completionTarget: '写周报已完成',
    }));
    const outcome = await service.submitInput('写周报已完成');
    expect(outcome.kind).toBe('completed');
    if (outcome.kind !== 'completed') return;
    expect(outcome.task).toMatchObject({
      status: 'completed',
      completionDate: '2026-10-28',
    });
    expect(tasks.dailyCompletionSummary('2026-10-28').completedCount).toBe(1);
  });

  it('requires selection for multiple matches and changes nothing yet', async () => {
    const first = tasks.create('写周报');
    tasks.create('写周报');
    const service = serviceWith(async () => ({
      intent: 'complete',
      completionTarget: '写周报',
    }));
    const outcome = await service.submitInput('写周报完成了');
    expect(outcome).toMatchObject({
      kind: 'selection_required',
      candidates: expect.any(Array),
    });
    if (outcome.kind !== 'selection_required') return;
    expect(outcome.candidates).toHaveLength(2);
    expect(tasks.get(first.id).status).toBe('open');
    const chosen = await service.selectCandidate({
      intakeId: outcome.intakeId,
      taskId: first.id,
      revision: first.revision,
    });
    expect(chosen.status).toBe('completed');
    expect(tasks.get(first.id).status).toBe('completed');
  });

  it('does not guess on no match and preserves a failed parse for retry', async () => {
    const service = serviceWith(async () => ({
      intent: 'complete',
      completionTarget: '不存在',
    }));
    const noMatch = await service.submitInput('不存在完成了');
    expect(noMatch.kind).toBe('no_match');
    expect(tasks.list()).toHaveLength(0);

    const failing = vi
      .fn()
      .mockRejectedValueOnce(new ParseClientError('NETWORK_ERROR'))
      .mockResolvedValueOnce(createIntent);
    const retryService = serviceWith(failing);
    const failed = await retryService.submitInput('写周报');
    expect(failed).toMatchObject({
      kind: 'failed',
      error: 'NETWORK_ERROR',
      message: expect.any(String),
    });
    if (failed.kind !== 'failed') return;
    expect(intakes.get(failed.intakeId).rawText).toBe('写周报');
    expect((await retryService.retryInput(failed.intakeId)).kind).toBe('task');
  });
});
