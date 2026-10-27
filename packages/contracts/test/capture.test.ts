import { describe, expect, it } from 'vitest';
import { parsedTaskSchema, rawTextSchema, taskPatchSchema } from '../src/capture';

const validParsedTask = {
  title: '联系小王确认稿件',
  dueDate: '2026-10-26',
  dueTime: null,
  contact: '小王',
};

describe('capture contracts', () => {
  it('accepts nullable unknown fields', () => {
    expect(parsedTaskSchema.parse({ ...validParsedTask, dueDate: null, contact: null })).toEqual({
      ...validParsedTask,
      dueDate: null,
      contact: null,
    });
  });

  it('rejects invalid dates and times', () => {
    expect(() => parsedTaskSchema.parse({ ...validParsedTask, dueDate: '2026-02-30' })).toThrow();
    expect(() => parsedTaskSchema.parse({ ...validParsedTask, dueTime: '25:00' })).toThrow();
  });

  it('requires a date when time is present', () => {
    expect(() => parsedTaskSchema.parse({ ...validParsedTask, dueDate: null, dueTime: '09:00' })).toThrow();
  });

  it('rejects additional model fields instead of trusting them', () => {
    expect(() => parsedTaskSchema.parse({ ...validParsedTask, recordedAt: '2020-01-01T00:00:00Z' })).toThrow();
  });

  it('trims raw text and rejects empty or oversized submissions', () => {
    expect(rawTextSchema.parse('  写周报  ')).toBe('写周报');
    expect(() => rawTextSchema.parse('   ')).toThrow();
    expect(() => rawTextSchema.parse('x'.repeat(2001))).toThrow();
  });

  it('rejects unknown edit fields', () => {
    expect(() => taskPatchSchema.parse({ recordedAt: '2020-01-01T00:00:00Z' })).toThrow();
  });
});
