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
const parsed = { title: '联系小王确认稿件', dueDate: '2026-10-26', dueTime: '10:00', contact: '小王' };
let app: INestApplication;

function deepSeekResponse(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
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
    const fetchMock = vi.fn().mockResolvedValue(deepSeekResponse(JSON.stringify(parsed)));
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app.getHttpServer()).post('/v1/parse').send(input).expect(201);
    expect(response.body).toEqual({ requestId: input.requestId, result: parsed });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects additional or missing model fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(deepSeekResponse(JSON.stringify({ ...parsed, recordedAt: '2020-01-01' }))));
    const response = await request(app.getHttpServer()).post('/v1/parse').send(input).expect(502);
    expect(response.body.code).toBe('PARSE_INVALID_RESPONSE');
  });

  it('rejects invalid JSON without exposing upstream content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(deepSeekResponse('not-json-secret')));
    const response = await request(app.getHttpServer()).post('/v1/parse').send(input).expect(502);
    expect(response.body.code).toBe('PARSE_INVALID_RESPONSE');
    expect(JSON.stringify(response.body)).not.toContain('not-json-secret');
  });

  it('maps timeout and upstream errors to stable codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'TimeoutError')));
    const timeout = await request(app.getHttpServer()).post('/v1/parse').send(input).expect(504);
    expect(timeout.body.code).toBe('PARSE_TIMEOUT');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(deepSeekResponse({}, 500)));
    const unavailable = await request(app.getHttpServer()).post('/v1/parse').send(input).expect(502);
    expect(unavailable.body.code).toBe('PARSE_UNAVAILABLE');
  });

  it('does not call DeepSeek without a server key', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app.getHttpServer()).post('/v1/parse').send(input).expect(503);
    expect(response.body.code).toBe('PARSE_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
