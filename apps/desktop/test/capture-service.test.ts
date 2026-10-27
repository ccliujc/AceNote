import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import type { ParseRequest, ParsedTask } from '@acenote/contracts';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { ParseQueue, ParseClientError } from '../src/main/parse-queue';
import { CaptureService } from '../src/main/capture-service';

const parsed: ParsedTask = { title: '写周报', dueDate: '2026-10-26', dueTime: null, contact: null };
let database: Database.Database;
let repository: TaskRepository;

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new TaskRepository(database, {
    clock: () => new Date('2026-10-25T14:30:00.000Z'),
    timeZone: 'Asia/Shanghai',
  });
});
afterEach(() => database.close());

function serviceWith(parser: (request: ParseRequest) => Promise<ParsedTask>) {
  const queue = new ParseQueue(repository, parser, { clock: () => new Date('2026-10-25T14:30:00.000Z') });
  return { service: new CaptureService(repository, queue), queue };
}

describe('CaptureService', () => {
  it('saves raw text before parsing and applies a successful result', async () => {
    const parser = vi.fn().mockResolvedValue(parsed);
    const { service, queue } = serviceWith(parser);
    const task = await service.submitTask('明天写周报');
    expect(task.parseStatus).toBe('pending');
    expect(parser).toHaveBeenCalledWith(expect.objectContaining({ requestId: task.id }));
    await queue.idle();
    expect(repository.get(task.id)).toMatchObject({ parseStatus: 'succeeded', title: '写周报', dueDate: '2026-10-26' });
  });

  it('does not call the parser when local validation fails', async () => {
    const parser = vi.fn();
    const { service } = serviceWith(parser);
    await expect(service.submitTask('   ')).rejects.toThrow();
    expect(parser).not.toHaveBeenCalled();
  });

  it('keeps raw text after failure and retries with the same UUID', async () => {
    const parser = vi.fn()
      .mockRejectedValueOnce(new ParseClientError('NETWORK_ERROR'))
      .mockResolvedValueOnce(parsed);
    const { service, queue } = serviceWith(parser);
    const task = await service.submitTask('写周报');
    await queue.idle();
    expect(repository.get(task.id)).toMatchObject({ rawText: '写周报', parseStatus: 'failed', parseError: 'NETWORK_ERROR' });
    await service.retryParse(task.id);
    await queue.idle();
    expect(repository.list()).toHaveLength(1);
    expect(repository.get(task.id).parseStatus).toBe('succeeded');
    expect(parser.mock.calls.every(([request]) => request.requestId === task.id)).toBe(true);
  });

  it('does not overwrite a manual edit with a late parse result', async () => {
    let resolveParse!: (value: ParsedTask) => void;
    const parser = vi.fn().mockReturnValue(new Promise<ParsedTask>((resolve) => { resolveParse = resolve; }));
    const { service, queue } = serviceWith(parser);
    const task = await service.submitTask('明天写周报');
    await service.updateTask(task.id, { title: '手动标题' }, task.revision);
    resolveParse(parsed);
    await queue.idle();
    expect(repository.get(task.id).title).toBe('手动标题');
  });

  it('preserves edited fields when reparse mode is preserve', async () => {
    const parser = vi.fn().mockResolvedValue(parsed);
    const { service, queue } = serviceWith(parser);
    const task = await service.submitTask('写周报');
    await queue.idle();
    const edited = await service.updateTask(task.id, { title: '手动标题' }, 1);
    await service.reparseTask(edited.id, 'preserve');
    await queue.idle();
    expect(repository.get(task.id).title).toBe('手动标题');
  });
});
