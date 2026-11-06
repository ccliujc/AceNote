import { vi } from "vitest";
import type {
  ActiveReminder,
  ActiveReminderState,
  ReminderApi,
} from "@acenote/contracts";
export const sessionId = "11111111-1111-4111-8111-111111111111";
export const emptyReminderState: ActiveReminderState = {
  sessionId,
  revision: 0,
  reminders: [],
};
export function reminderApiFixture(): ReminderApi {
  return {
    getActiveReminders: vi.fn().mockResolvedValue(emptyReminderState),
    onActiveRemindersChanged: vi.fn(() => () => {}),
    dismissReminder: vi.fn().mockResolvedValue(emptyReminderState),
  };
}
export function activeItem(
  title = "吃饭",
  activationId = "22222222-2222-4222-8222-222222222222",
  taskId = "33333333-3333-4333-8333-333333333333",
): ActiveReminder {
  return {
    activationId,
    reminder: {
      id: taskId,
      taskId,
      title,
      dueDate: "2026-11-05",
      dueTime: "12:00",
      scheduledAt: "2026-11-05T04:00:00.000Z",
    },
  };
}
