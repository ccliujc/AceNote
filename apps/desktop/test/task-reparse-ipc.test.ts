import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskReparseService } from "../src/main/task-reparse-service";
const native = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, fn: (...args: any[]) => any) =>
      native.handlers.set(key, fn),
  },
}));
import { registerTaskReparseIpc } from "../src/main/ipc";
const service = { reparseTask: vi.fn() };
const request = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 0,
  mode: "preserve",
};
beforeEach(() => {
  vi.clearAllMocks();
  native.handlers.clear();
  registerTaskReparseIpc(service as unknown as TaskReparseService);
});
describe("task reparse IPC", () => {
  it("forwards exact requests and validates safe business failures", async () => {
    const outcome = { kind: "failed", error: "REPARSE_UNSUPPORTED_INTENT" };
    service.reparseTask.mockResolvedValue(outcome);
    expect(await native.handlers.get("task:reparse")!({}, request)).toEqual(
      outcome,
    );
    expect(service.reparseTask).toHaveBeenCalledExactlyOnceWith(request);
  });
  it("rejects legacy or malformed requests before entering the service", async () => {
    for (const bad of [
      request.id,
      null,
      {},
      { ...request, id: "bad" },
      { ...request, revision: -1 },
      { ...request, mode: "guess" },
      { ...request, rawText: "injected" },
    ]) {
      await expect(
        native.handlers.get("task:reparse")!({}, bad),
      ).rejects.toThrow();
    }
    expect(service.reparseTask).not.toHaveBeenCalled();
  });
  it("rejects malformed service returns rather than passing internal details", async () => {
    for (const outcome of [
      undefined,
      { kind: "failed", error: "secret" },
      { kind: "failed", error: "STORAGE_ERROR", stack: "secret" },
      { kind: "updated", task: {}, warning: null },
    ]) {
      service.reparseTask.mockResolvedValueOnce(outcome);
      await expect(
        native.handlers.get("task:reparse")!({}, request),
      ).rejects.toThrow();
    }
  });
});
