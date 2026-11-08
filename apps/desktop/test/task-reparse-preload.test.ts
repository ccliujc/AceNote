import { describe, expect, it, vi } from "vitest";
import type { TaskReparseApi } from "@acenote/contracts";
const native = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
  },
}));
vi.mock("electron", () => native);
describe("task reparse preload", () => {
  it("adds a single method only to the main preload", async () => {
    await import("../src/preload/index");
    const exposed = native.contextBridge.exposeInMainWorld.mock.calls;
    const api = exposed.find(
      (c) => c[0] === "taskReparse",
    )![1] as TaskReparseApi;
    expect(Object.keys(api)).toEqual(["reparseTask"]);
    const request = {
      id: "11111111-1111-4111-8111-111111111111",
      revision: 2,
      mode: "preserve" as const,
    };
    const result = { kind: "failed", error: "REPARSE_BUSY" };
    native.ipcRenderer.invoke.mockResolvedValueOnce(result);
    expect(await api.reparseTask(request)).toBe(result);
    expect(native.ipcRenderer.invoke).toHaveBeenCalledWith(
      "task:reparse",
      request,
    );
    expect(exposed.map((c) => c[0]).sort()).toEqual(
      [
        "editor",
        "lifecycle",
        "reminder",
        "experience",
        "recovery",
        "taskReparse",
      ].sort(),
    );
    native.contextBridge.exposeInMainWorld.mockClear();
    await import("../src/preload/pet");
    await import("../src/preload/quick-input");
    expect(
      native.contextBridge.exposeInMainWorld.mock.calls.map((c) => c[0]),
    ).not.toContain("taskReparse");
    for (const [, value] of native.contextBridge.exposeInMainWorld.mock.calls)
      expect(value).not.toHaveProperty("reparseTask");
  });
});
