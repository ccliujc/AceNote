import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { IntakeRepository } from '../src/main/intake-repository';

let database: Database.Database;
let repository: IntakeRepository;
const now = new Date('2026-10-28T01:00:00.000Z');

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new IntakeRepository(database, {
    clock: () => now,
    idGenerator: () => '11111111-1111-4111-8111-111111111111',
    timeZone: 'Asia/Shanghai',
  });
});
afterEach(() => database.close());

describe('IntakeRepository', () => {
  it('stores raw text before parsing with device date context', () => {
    expect(repository.create('  明天写周报  ')).toMatchObject({
      rawText: '明天写周报', status: 'pending', localDate: '2026-10-28',
      localDateTime: now.toISOString(), timeZone: 'Asia/Shanghai',
    });
  });

  it('tracks selection, failure, retry and resolution without changing raw text', () => {
    const intake = repository.create('写周报已完成');
    expect(repository.markAwaitingSelection(intake.id, 'complete')).toMatchObject({ status: 'awaiting_selection', intent: 'complete' });
    expect(repository.markFailed(intake.id, 'NETWORK_ERROR')).toMatchObject({ status: 'failed', error: 'NETWORK_ERROR' });
    expect(repository.listRecoverable()).toHaveLength(1);
    expect(repository.markPending(intake.id).status).toBe('pending');
    const resolved = repository.markResolved(intake.id, 'complete');
    expect(resolved).toMatchObject({ status: 'resolved', rawText: '写周报已完成', intent: 'complete' });
    expect(repository.listRecoverable()).toHaveLength(0);
  });

  it('reports a missing intake', () => {
    expect(() => repository.get('22222222-2222-4222-8222-222222222222')).toThrow('NOT_FOUND');
    expect(() => repository.markFailed('22222222-2222-4222-8222-222222222222', 'UNKNOWN_ERROR')).toThrow('NOT_FOUND');
  });
});
