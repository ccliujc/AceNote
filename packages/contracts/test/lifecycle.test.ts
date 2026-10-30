import { describe, expect, it } from 'vitest';
import {
  intakeSchema,
  lifecycleTaskSchema,
  parseIntentResultSchema,
} from '../src/lifecycle';

const task = {
  id: '11111111-1111-4111-8111-111111111111', rawText: '写周报', title: '写周报',
  recordedAt: '2026-10-28T01:00:00.000Z', recordDate: '2026-10-28', dueDate: null, dueTime: null,
  timeZone: 'Asia/Shanghai', contact: null, parseStatus: 'succeeded', parseError: null,
  createdAt: '2026-10-28T01:00:00.000Z', updatedAt: '2026-10-28T01:00:00.000Z', editedAt: null, revision: 1,
  status: 'open', completedAt: null, completionDate: null, completionTimeZone: null, archivedAt: null,
} as const;

describe('lifecycle contracts', () => {
  it('accepts lifecycle task states and completion metadata', () => {
    expect(lifecycleTaskSchema.parse({ ...task, status: 'completed', completedAt: task.recordedAt, completionDate: '2026-10-28', completionTimeZone: 'Asia/Shanghai' }).status).toBe('completed');
    expect(() => lifecycleTaskSchema.parse({ ...task, status: 'done' })).toThrow();
  });

  it('accepts only create or complete intents', () => {
    expect(parseIntentResultSchema.parse({ intent: 'create', task: { title: '写周报', dueDate: null, dueTime: null, contact: null } }).intent).toBe('create');
    expect(parseIntentResultSchema.parse({ intent: 'complete', completionTarget: '写周报' }).intent).toBe('complete');
    expect(() => parseIntentResultSchema.parse({ intent: 'delete', taskId: task.id })).toThrow();
    expect(() => parseIntentResultSchema.parse({ intent: 'complete', completionTarget: '', taskId: task.id })).toThrow();
  });

  it('validates intake lifecycle records', () => {
    expect(intakeSchema.parse({ id: task.id, rawText: '写周报', receivedAt: task.recordedAt, localDate: '2026-10-28', localDateTime: task.recordedAt, timeZone: 'Asia/Shanghai', status: 'pending', intent: null, error: null, createdAt: task.createdAt, updatedAt: task.updatedAt }).status).toBe('pending');
  });
});
