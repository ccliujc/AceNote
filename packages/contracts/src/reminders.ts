import { z } from "zod";
import { dueDateSchema, dueTimeSchema } from "./capture";

export const REMINDER_STATUSES = [
  "scheduled",
  "fired",
  "cancelled",
  "missed",
] as const;
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

export const activeReminderSchema = z
  .object({
    activationId: z.uuid(),
    reminder: reminderViewSchema,
  })
  .strict();

export const activeReminderStateSchema = z
  .object({
    sessionId: z.uuid(),
    revision: z.number().int().nonnegative(),
    reminders: z.array(activeReminderSchema),
  })
  .strict()
  .superRefine((state, context) => {
    const activations = new Set<string>(),
      tasks = new Set<string>();
    for (const item of state.reminders) {
      if (activations.has(item.activationId) || tasks.has(item.reminder.taskId))
        context.addIssue({
          code: "custom",
          message: "Duplicate active reminder",
        });
      activations.add(item.activationId);
      tasks.add(item.reminder.taskId);
    }
  });

export const dismissActiveReminderSchema = z
  .object({
    sessionId: z.uuid(),
    activationId: z.uuid(),
  })
  .strict();

export const reminderDueEventSchema = dismissActiveReminderSchema.extend({
  revision: z.number().int().nonnegative(),
  reminder: reminderViewSchema,
});

export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderView = z.infer<typeof reminderViewSchema>;
export type ReminderDueEvent = z.infer<typeof reminderDueEventSchema>;
export type ActiveReminder = z.infer<typeof activeReminderSchema>;
export type ActiveReminderState = z.infer<typeof activeReminderStateSchema>;
export type DismissActiveReminder = z.infer<typeof dismissActiveReminderSchema>;

export interface ActiveReminderReadApi {
  getActiveReminders: () => Promise<ActiveReminderState>;
  onActiveRemindersChanged: (
    listener: (state: ActiveReminderState) => void,
  ) => () => void;
}

export interface ReminderApi extends ActiveReminderReadApi {
  dismissReminder: (
    reference: DismissActiveReminder,
  ) => Promise<ActiveReminderState>;
}
