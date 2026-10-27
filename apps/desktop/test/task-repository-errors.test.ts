import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';

let database: Database.Database;
let repository: TaskRepository;

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new TaskRepository(database, { timeZone: 'Asia/Shanghai' });
});
afterEach(() => database.close());

describe('TaskRepository boundaries', () => {
  it('uses default clock, id and timezone when options are omitted', () => {
    const defaultRepository = new TaskRepository(database);
    const task = defaultRepository.create('默认环境写周报');
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.recordDate).toBe(new Date().toISOString().slice(0, 10));
    expect(defaultRepository.list()).toHaveLength(1);
  });

  it('reports missing records and stale revisions', () => {
    expect(() => repository.get('33333333-3333-4333-8333-333333333333')).toThrow('NOT_FOUND');
    const task = repository.create('写周报');
    repository.update(task.id, { title: '完成周报' }, 0);
    expect(() => repository.update(task.id, { title: '再次修改' }, 0)).toThrow('CONCURRENT_EDIT');
  });

  it('stores parse status and error codes', () => {
    const task = repository.create('写周报');
    expect(repository.setParseStatus(task.id, 'failed', 'PARSE_TIMEOUT')).toMatchObject({
      parseStatus: 'failed', parseError: 'PARSE_TIMEOUT',
    });
  });
});
