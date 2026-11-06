import { describe, expect, expectTypeOf, it } from "vitest";
import {
  activeReminderStateSchema,
  dismissActiveReminderSchema,
  experienceEventSchema,
  reminderDueEventSchema,
  type ReminderApi,
  type PetApi,
  type QuickInputApi,
} from "../src";

const id = "11111111-1111-4111-8111-111111111111";
const activationId = "22222222-2222-4222-8222-222222222222";
const reminder = {
  id,
  taskId: id,
  title: "吃饭",
  dueDate: "2026-11-05",
  dueTime: "12:00",
  scheduledAt: "2026-11-05T04:00:00.000Z",
};
const empty = { sessionId: id, revision: 0, reminders: [] };
describe("active reminder contracts", () => {
  it("accepts empty and active states and typed experience events", () => {
    expect(activeReminderStateSchema.parse(empty)).toEqual(empty);
    const state = {
      ...empty,
      revision: 2,
      reminders: [{ activationId, reminder }],
    };
    expect(
      experienceEventSchema.parse({
        type: "reminder:active-changed",
        payload: state,
      }).payload,
    ).toEqual(state);
    expect(
      reminderDueEventSchema.parse({
        sessionId: id,
        activationId,
        revision: 2,
        reminder,
      }).activationId,
    ).toBe(activationId);
  });
  it("rejects invalid versions and duplicate activations or tasks", () => {
    for (const revision of [-1, 0.5, "1", Infinity, undefined])
      expect(
        activeReminderStateSchema.safeParse({ ...empty, revision }).success,
      ).toBe(false);
    expect(
      activeReminderStateSchema.safeParse({ ...empty, sessionId: "bad" })
        .success,
    ).toBe(false);
    expect(
      activeReminderStateSchema.safeParse({
        ...empty,
        reminders: [
          { activationId, reminder },
          { activationId, reminder },
        ],
      }).success,
    ).toBe(false);
    expect(
      activeReminderStateSchema.safeParse({
        ...empty,
        reminders: [
          { activationId, reminder },
          { activationId: id, reminder },
        ],
      }).success,
    ).toBe(false);
  });
  it("requires exact activation references and rejects old signatures", () => {
    expect(
      dismissActiveReminderSchema.parse({ sessionId: id, activationId }),
    ).toEqual({ sessionId: id, activationId });
    for (const value of [
      id,
      { sessionId: id },
      { activationId },
      { sessionId: id, activationId: "bad" },
      { sessionId: id, activationId, reminderId: id },
    ])
      expect(dismissActiveReminderSchema.safeParse(value).success).toBe(false);
    expect(reminderDueEventSchema.safeParse({ reminder }).success).toBe(false);
  });
  it("keeps closing exclusive to the full-record API", () => {
    expectTypeOf<ReminderApi["dismissReminder"]>()
      .parameter(0)
      .toEqualTypeOf<{ sessionId: string; activationId: string }>();
    expectTypeOf<
      Extract<keyof PetApi, "dismissReminder">
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof QuickInputApi, "getActiveReminders" | "dismissReminder">
    >().toEqualTypeOf<never>();
  });
});
