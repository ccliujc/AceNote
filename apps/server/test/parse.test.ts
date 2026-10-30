import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApplication } from '../src/main';

const input = {
  requestId: '11111111-1111-4111-8111-111111111111',
  rawText: '明天上午十点联系小王确认稿件',
  localDateTime: '2026-10-25T22:30:00+08:00',
  timeZone: 'Asia/Shanghai',
};
const parsed = {
  intent: 'create',
  task: {
    title: '联系小王确认稿件',
    dueDate: '2026-10-26',
    dueTime: '10:00',
    contact: '小王',
  },
};
let app: INestApplication;

function deepSeekResponse(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
  });
}

beforeEach(async () => {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  app = await createApplication();
  await app.init();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /v1/parse', () => {
  it('returns validated parsed fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(deepSeekResponse(JSON.stringify(parsed)));
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app.getHttpServer())
      .post('/v1/parse')
      .send(input)
      .expect(201);
    expect(response.body).toEqual({
      requestId: input.requestId,
      result: parsed,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns a validated complete intent without a task', async () => {
    const complete = { intent: 'complete', completionTarget: '确认稿件' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deepSeekResponse(JSON.stringify(complete))),
    );
    const response = await request(app.getHttpServer())
      .post('/v1/parse')
      .send(input)
      .expect(201);
    expect(response.body).toEqual({
      requestId: input.requestId,
      result: complete,
    });
  });

  it.each([null, '12:00'])(
    'fills today from a clear time when the model returned %s',
    async (dueTime) => {
      const responseTask = {
        intent: 'create',
        task: { title: '吃饭', dueDate: null, dueTime, contact: null },
      };
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(deepSeekResponse(JSON.stringify(responseTask))),
      );
      const response = await request(app.getHttpServer())
        .post('/v1/parse')
        .send({
          ...input,
          rawText: '12点钟提醒我吃饭',
          localDateTime: '2026-10-30T03:00:00Z',
        })
        .expect(201);
      expect(response.body.result).toEqual({
        intent: 'create',
        task: {
          title: '吃饭',
          dueDate: '2026-10-30',
          dueTime: '12:00',
          contact: null,
        },
      });
    },
  );

  it('still rejects invalid and additional fields while normalizing a time-only input', async () => {
    for (const task of [
      { title: '吃饭', dueDate: null, dueTime: '25:00', contact: null },
      {
        title: '吃饭',
        dueDate: null,
        dueTime: null,
        contact: null,
        status: 'open',
      },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            deepSeekResponse(JSON.stringify({ intent: 'create', task })),
          ),
      );
      await request(app.getHttpServer())
        .post('/v1/parse')
        .send({ ...input, rawText: '12点吃饭' })
        .expect(502);
    }
  });

  it('rejects additional, empty-target or task-id model fields', async () => {
    for (const invalid of [
      { ...parsed, recordedAt: '2020-01-01' },
      { intent: 'complete', completionTarget: '' },
      {
        intent: 'complete',
        completionTarget: '写周报',
        taskId: input.requestId,
      },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(deepSeekResponse(JSON.stringify(invalid))),
      );
      const response = await request(app.getHttpServer())
        .post('/v1/parse')
        .send(input)
        .expect(502);
      expect(response.body.code).toBe('PARSE_INVALID_RESPONSE');
    }
  });

  it('rejects invalid JSON without exposing upstream content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deepSeekResponse('not-json-secret')),
    );
    const response = await request(app.getHttpServer())
      .post('/v1/parse')
      .send(input)
      .expect(502);
    expect(response.body.code).toBe('PARSE_INVALID_RESPONSE');
    expect(JSON.stringify(response.body)).not.toContain('not-json-secret');
  });

  it('maps timeout and upstream errors to stable codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('aborted', 'TimeoutError')),
    );
    const timeout = await request(app.getHttpServer())
      .post('/v1/parse')
      .send(input)
      .expect(504);
    expect(timeout.body.code).toBe('PARSE_TIMEOUT');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deepSeekResponse({}, 500)),
    );
    const unavailable = await request(app.getHttpServer())
      .post('/v1/parse')
      .send(input)
      .expect(502);
    expect(unavailable.body.code).toBe('PARSE_UNAVAILABLE');
  });

  it('does not call DeepSeek without a server key', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app.getHttpServer())
      .post('/v1/parse')
      .send(input)
      .expect(503);
    expect(response.body.code).toBe('PARSE_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
