import { describe, expect, it } from 'vitest';
import { isOverdue, reminderAt, zonedTimeToUtc } from '../src/main/reminder-time';

describe('reminder time', () => {
  it('defaults date-only reminders to 09:00 local time', () => {
    expect(reminderAt('2026-10-28', null, 'Asia/Shanghai')?.toISOString()).toBe('2026-10-28T01:00:00.000Z');
    expect(reminderAt('2026-10-28', '15:30', 'Asia/Shanghai')?.toISOString()).toBe('2026-10-28T07:30:00.000Z');
  });

  it('returns null without a date or for invalid values', () => {
    expect(reminderAt(null, '09:00', 'Asia/Shanghai')).toBeNull();
    expect(reminderAt('2026-02-30', null, 'Asia/Shanghai')).toBeNull();
    expect(reminderAt('2026-10-28', '25:00', 'Asia/Shanghai')).toBeNull();
    expect(zonedTimeToUtc('not-a-date', 'Asia/Shanghai')).toBeNull();
  });

  it('handles both sides of a DST transition', () => {
    expect(reminderAt('2026-01-15', null, 'America/New_York')?.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    expect(reminderAt('2026-07-15', null, 'America/New_York')?.toISOString()).toBe('2026-07-15T13:00:00.000Z');
    expect(reminderAt('2026-03-08', null, 'America/New_York')?.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('compares overdue independent of reminder delivery', () => {
    expect(isOverdue('2026-10-27', null, new Date('2026-10-28T12:00:00Z'), 'Asia/Shanghai')).toBe(true);
    expect(isOverdue('2026-10-29', null, new Date('2026-10-28T12:00:00Z'), 'Asia/Shanghai')).toBe(false);
  });
});
