import { describe, expect, it, vi } from "vitest";
import type { PetApi, QuickInputApi, ReminderApi } from "@acenote/contracts";
import {
  activeItem,
  emptyReminderState,
  sessionId,
} from "./active-reminder-fixtures";
const native = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));
vi.mock("electron", () => native);
import "../src/preload/index";
import "../src/preload/pet";
import "../src/preload/quick-input";
const get = <T>(key: string) =>
  native.contextBridge.exposeInMainWorld.mock.calls.find(
    (c) => c[0] === key,
  )![1] as T;
const main = get<ReminderApi>("reminder"),
  pet = get<PetApi>("pet"),
  quick = get<QuickInputApi>("today");
describe("reminder preload capabilities", () => {
  it("exposes closing only in the full window and forwards exact calls", async () => {
    const ref = { sessionId, activationId: sessionId };
    await main.getActiveReminders();
    await main.dismissReminder(ref);
    await pet.getActiveReminders();
    expect(native.ipcRenderer.invoke.mock.calls.slice(-3)).toEqual([
      ["reminder:active"],
      ["reminder:dismiss", ref],
      ["reminder:active"],
    ]);
    expect(Object.keys(main).sort()).toEqual(
      [
        "dismissReminder",
        "getActiveReminders",
        "onActiveRemindersChanged",
      ].sort(),
    );
    expect(pet).not.toHaveProperty("dismissReminder");
    expect(quick).not.toHaveProperty("getActiveReminders");
    expect(main).not.toHaveProperty("invoke");
    expect(pet).not.toHaveProperty("invoke");
  });
  it.each([main, pet])(
    "validates state and removes exactly the original listener",
    (api) => {
      const listener = vi.fn(),
        off = api.onActiveRemindersChanged(listener);
      const handler = native.ipcRenderer.on.mock.calls.at(-1)![1];
      for (const payload of [
        null,
        {},
        { ...emptyReminderState, revision: -1 },
        { ...emptyReminderState, sessionId: "bad" },
        { ...emptyReminderState, reminders: [activeItem(), activeItem()] },
        {
          ...emptyReminderState,
          reminders: [
            {
              ...activeItem(),
              reminder: { ...activeItem().reminder, rawText: "unexpected" },
            },
          ],
        },
      ])
        handler({}, payload);
      handler({}, emptyReminderState);
      expect(listener).toHaveBeenCalledExactlyOnceWith(emptyReminderState);
      off();
      expect(native.ipcRenderer.removeListener).toHaveBeenCalledWith(
        "reminder:active-changed",
        handler,
      );
    },
  );
  it("requires full identity on pet due notifications", () => {
    const listener = vi.fn(),
      off = pet.onReminderDue(listener);
    const handler = native.ipcRenderer.on.mock.calls.at(-1)![1],
      item = activeItem();
    handler({}, { reminder: item.reminder });
    const event = { sessionId, revision: 1, ...item };
    handler({}, event);
    expect(listener).toHaveBeenCalledExactlyOnceWith(event);
    off();
    expect(native.ipcRenderer.removeListener).toHaveBeenCalledWith(
      "reminder:due",
      handler,
    );
  });
});
