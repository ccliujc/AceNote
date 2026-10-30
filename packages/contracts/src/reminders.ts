import { z } from 'zod';
import { dueDateSchema, dueTimeSchema } from './capture';

export const REMINDER_STATUSES = ['scheduled', 'fired', 'cancelled', 'missed'] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);

export const reminderSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  scheduledAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1),
  status: reminderStatusSchema,
  firedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const reminderViewSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  title: z.string().min(1),
  dueDate: dueDateSchema,
  dueTime: dueTimeSchema.nullable(),
  scheduledAt: z.iso.datetime({ offset: true }),
});

export const reminderDueEventSchema = z.object({
  reminder: reminderViewSchema,
});

export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderView = z.infer<typeof reminderViewSchema>;
export type ReminderDueEvent = z.infer<typeof reminderDueEventSchema>;

export interface ReminderApi {
  onReminderDue: (listener: (event: ReminderDueEvent) => void) => () => void;
  dismissReminder: (reminderId: string) => Promise<void>;
}
