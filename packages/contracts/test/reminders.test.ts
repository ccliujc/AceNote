import { describe, expect, it } from 'vitest';
import { reminderDueEventSchema, reminderStatusSchema, reminderViewSchema } from '../src/reminders';

const reminder = {
  id: '11111111-1111-4111-8111-111111111111',
  taskId: '22222222-2222-4222-8222-222222222222',
  title: '写周报', dueDate: '2026-10-28', dueTime: null,
  scheduledAt: '2026-10-28T01:00:00.000Z',
};

describe('reminder contracts', () => {
  it('validates reminder states and due events', () => {
    expect(reminderStatusSchema.parse('scheduled')).toBe('scheduled');
    expect(reminderDueEventSchema.parse({ reminder }).reminder.title).toBe('写周报');
    expect(reminderViewSchema.parse(reminder).dueTime).toBeNull();
  });

  it('rejects invalid IDs and states', () => {
    expect(() => reminderViewSchema.parse({ ...reminder, taskId: 'bad' })).toThrow();
    expect(() => reminderStatusSchema.parse('pending')).toThrow();
  });
});
