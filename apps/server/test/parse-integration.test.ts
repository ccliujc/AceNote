import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApplication } from '../src/main';

let app: INestApplication;
const input = {
  requestId: '11111111-1111-4111-8111-111111111111', rawText: '明天写周报',
  localDateTime: '2026-10-25T23:30:00+08:00', timeZone: 'Asia/Shanghai',
};

beforeEach(async () => {
  process.env.DEEPSEEK_API_KEY = 'integration-secret';
  app = await createApplication();
  await app.init();
});
afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe('parse integration', () => {
  it('sends date context without exposing the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: 'create', task: { title: '写周报', dueDate: '2026-10-26', dueTime: null, contact: null } }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await request(app.getHttpServer()).post('/v1/parse').send(input).expect(201);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('DeepSeek was not called');
    const options = call[1] as { body: string };
    expect(options.body).toContain('2026-10-25T23:30:00+08:00');
    expect(options.body).toContain('Asia/Shanghai');
    expect(options.body).not.toContain('integration-secret');
  });

  it('rejects invalid input before calling the upstream service', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app.getHttpServer()).post('/v1/parse').send({ ...input, rawText: '' }).expect(400);
    expect(response.body.code).toBe('INVALID_INPUT');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
