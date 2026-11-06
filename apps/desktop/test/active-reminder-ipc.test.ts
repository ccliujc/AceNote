import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveReminderService } from "../src/main/active-reminder-service";
import type { TaskRepository } from "../src/main/task-repository";
import { emptyReminderState, sessionId } from "./active-reminder-fixtures";
const native = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) =>
      native.handlers.set(channel, handler),
  },
}));
import { registerEditorIpc, registerReminderIpc } from "../src/main/ipc";
const service = { getActiveReminders: vi.fn(), dismissReminder: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  native.handlers.clear();
  service.getActiveReminders.mockReturnValue(emptyReminderState);
  service.dismissReminder.mockReturnValue(emptyReminderState);
  registerReminderIpc(service as unknown as ActiveReminderService);
});
describe("active reminder IPC", () => {
  it("returns validated state and forwards exact activation references", () => {
    expect(native.handlers.get("reminder:active")!({})).toEqual(
      emptyReminderState,
    );
    const reference = { sessionId, activationId: sessionId };
    expect(native.handlers.get("reminder:dismiss")!({}, reference)).toEqual(
      emptyReminderState,
    );
    expect(service.dismissReminder).toHaveBeenCalledWith(reference);
    service.getActiveReminders.mockReturnValueOnce({
      ...emptyReminderState,
      revision: -1,
    });
    expect(() => native.handlers.get("reminder:active")!({})).toThrow();
    service.dismissReminder.mockReturnValueOnce(undefined);
    expect(() =>
      native.handlers.get("reminder:dismiss")!({}, reference),
    ).toThrow();
  });
  it("rejects old signatures and malformed references before any operation", () => {
    for (const value of [
      sessionId,
      undefined,
      {},
      { sessionId },
      { sessionId, activationId: "bad" },
      { sessionId, activationId: sessionId, revision: 1 },
    ])
      expect(() =>
        native.handlers.get("reminder:dismiss")!({}, value),
      ).toThrow();
    expect(service.dismissReminder).not.toHaveBeenCalled();
  });
  it("does not invent a success state on service failure", () => {
    service.dismissReminder.mockImplementationOnce(() => {
      throw new Error("CONCURRENT_EDIT");
    });
    expect(() =>
      native.handlers.get("reminder:dismiss")!(
        {},
        { sessionId, activationId: sessionId },
      ),
    ).toThrow("CONCURRENT_EDIT");
  });
  it("returns a committed edit despite failure in post-commit reminder synchronization", () => {
    const task = { id: sessionId, title: "新标题" },
      updated = vi.fn(() => {
        throw new Error("plan write failed");
      });
    const repository = { update: vi.fn(() => task) };
    registerEditorIpc(repository as unknown as TaskRepository, updated);
    expect(
      native.handlers.get("editor:update")!(
        {},
        sessionId,
        { title: task.title },
        1,
      ),
    ).toBe(task);
    expect(updated).toHaveBeenCalledWith(sessionId, task);
  });
});
