import { describe, expect, it } from 'vitest';
import type { LifecycleTask } from '@acenote/contracts';
import { isTaskTimePast } from '../src/renderer/task-time';

const task = {
  status: 'open',
  dueDate: '2026-10-30',
  dueTime: '12:00',
  timeZone: 'Asia/Shanghai',
} as const;
describe('task time display', () => {
  it('keeps a future clock time normal and marks the due minute as past', () => {
    expect(isTaskTimePast(task, new Date('2026-10-30T03:59:00Z'))).toBe(false);
    expect(isTaskTimePast(task, new Date('2026-10-30T04:00:00Z'))).toBe(true);
    expect(isTaskTimePast(task, new Date('2026-10-30T05:00:00Z'))).toBe(true);
  });
  it('uses the task timezone across calendar boundaries', () => {
    expect(
      isTaskTimePast(
        {
          ...task,
          dueDate: '2026-10-29',
          dueTime: '23:00',
          timeZone: 'America/Los_Angeles',
        },
        new Date('2026-10-30T01:00:00Z'),
      ),
    ).toBe(false);
    expect(
      isTaskTimePast(
        { ...task, dueDate: '2026-10-29' },
        new Date('2026-10-30T01:00:00Z'),
      ),
    ).toBe(true);
    expect(
      isTaskTimePast(
        { ...task, dueDate: '2026-10-31' },
        new Date('2026-10-30T01:00:00Z'),
      ),
    ).toBe(false);
  });
  it('does not mark untimed, inactive or invalid-zone tasks', () => {
    for (const value of [
      { ...task, dueDate: null },
      { ...task, dueTime: null },
      { ...task, status: 'completed' },
      { ...task, status: 'archived' },
      { ...task, timeZone: 'bad/zone' },
    ])
      expect(
        isTaskTimePast(
          value as LifecycleTask,
          new Date('2026-11-01T00:00:00Z'),
        ),
      ).toBe(false);
  });
});
