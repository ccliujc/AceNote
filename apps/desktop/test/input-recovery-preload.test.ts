import { describe, expect, it, vi } from "vitest";
import type { RecoveryApi, QuickInputApi } from "@acenote/contracts";
const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));
vi.mock("electron", () => electron);
import "../src/preload/index";
import "../src/preload/quick-input";
const api = electron.contextBridge.exposeInMainWorld.mock.calls.find(
  (c) => c[0] === "recovery",
)![1] as RecoveryApi;
const today = electron.contextBridge.exposeInMainWorld.mock.calls.find(
  (c) => c[0] === "today",
)![1] as QuickInputApi;
describe("recovery preload boundaries", () => {
  it("limits APIs and forwards exact recovery arguments", async () => {
    await api.listInputs();
    await api.getCandidates("input", 3);
    await api.reparseCandidates("input", 3);
    await today.getRecoverableSummary();
    expect(electron.ipcRenderer.invoke.mock.calls.slice(-4)).toEqual([
      ["recovery:list"],
      ["recovery:candidates", "input", 3],
      ["recovery:reparse-candidates", "input", 3],
      ["recovery:summary"],
    ]);
    expect(Object.keys(api).sort()).toEqual(
      [
        "getCandidates",
        "getRecoverableSummary",
        "listInputs",
        "onInputsChanged",
        "reparseCandidates",
      ].sort(),
    );
    expect(today).not.toHaveProperty("listInputs");
    expect(api).not.toHaveProperty("invoke");
  });
  it("validates notifications and releases exactly the subscribed handler", () => {
    const listener = vi.fn();
    const off = api.onInputsChanged(listener);
    const handler = electron.ipcRenderer.on.mock.calls.at(-1)![1];
    handler({}, { intakeId: "invalid", revision: 0 });
    handler(
      {},
      {
        intakeId: "11111111-1111-4111-8111-111111111111",
        revision: 2,
        status: "failed",
      },
    );
    expect(listener).toHaveBeenCalledOnce();
    off();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      "intake:changed",
      handler,
    );
  });
});
