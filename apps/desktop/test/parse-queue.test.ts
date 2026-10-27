import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { createHttpParser, ParseQueue } from '../src/main/parse-queue';
import { CaptureService } from '../src/main/capture-service';

let database: Database.Database;
let repository: TaskRepository;

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new TaskRepository(database, { timeZone: 'Asia/Shanghai' });
});
afterEach(() => {
  database.close();
  vi.unstubAllGlobals();
});

describe('parse queue error handling', () => {
  it('maps server error codes and mismatched request ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'NETWORK_ERROR' }), { status: 502 })));
    await expect(createHttpParser()({ requestId: '11111111-1111-4111-8111-111111111111', rawText: '写周报', localDateTime: '2026-10-25T14:30:00+08:00', timeZone: 'Asia/Shanghai' })
      .catch((error: { code: string }) => error.code)).resolves.toBe('NETWORK_ERROR');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ requestId: '22222222-2222-4222-8222-222222222222', result: { title: 'x', dueDate: null, dueTime: null, contact: null } }), { status: 200 })));
    await expect(createHttpParser()({ requestId: '11111111-1111-4111-8111-111111111111', rawText: '写周报', localDateTime: '2026-10-25T14:30:00+08:00', timeZone: 'Asia/Shanghai' })
      .catch((error: { code: string }) => error.code)).resolves.toBe('PARSE_INVALID_RESPONSE');
  });

  it('keeps raw text when the parser throws an unknown error', async () => {
    const queue = new ParseQueue(repository, async () => { throw 'boom'; });
    const service = new CaptureService(repository, queue);
    const task = await service.submitTask('写周报');
    await queue.idle();
    expect(repository.get(task.id)).toMatchObject({ rawText: '写周报', parseStatus: 'failed', parseError: 'UNKNOWN_ERROR' });
  });
});
