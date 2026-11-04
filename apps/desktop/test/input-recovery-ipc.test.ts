import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleService } from "../src/main/lifecycle-service";
const native = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      key: string,
      fn: (event: unknown, ...args: unknown[]) => unknown,
    ) => native.handlers.set(key, fn),
  },
}));
import { registerLifecycleIpc, registerRecoveryIpc } from "../src/main/ipc";
const id = "11111111-1111-4111-8111-111111111111";
const api = {
  listRecoverableInputs: vi.fn(() => []),
  getRecoverableSummary: vi.fn(() => ({ count: 0 })),
  getRecoveryCandidates: vi.fn(() => ({
    intakeId: id,
    intakeRevision: 4,
    candidates: [],
    requiresReparse: true,
  })),
  reparseRecoveryCandidates: vi.fn(),
  retryInput: vi.fn(),
  convertInputToTask: vi.fn(),
  selectCandidate: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  native.handlers.clear();
  registerLifecycleIpc(api as unknown as LifecycleService);
  registerRecoveryIpc(api as unknown as LifecycleService);
});
describe("recovery IPC", () => {
  it("exposes validated queries and rejects invalid returned data", async () => {
    expect(native.handlers.get("recovery:list")!({})).toEqual([]);
    expect(native.handlers.get("recovery:summary")!({})).toEqual({ count: 0 });
    expect(
      native.handlers.get("recovery:candidates")!({}, id, 4),
    ).toMatchObject({ intakeRevision: 4 });
    api.reparseRecoveryCandidates.mockResolvedValue({
      intakeId: id,
      intakeRevision: 5,
      candidates: [],
      requiresReparse: false,
    });
    await expect(
      native.handlers.get("recovery:reparse-candidates")!({}, id, 4),
    ).resolves.toMatchObject({ intakeRevision: 5 });
    api.getRecoverableSummary.mockReturnValueOnce({ count: -1 });
    expect(() => native.handlers.get("recovery:summary")!({})).toThrow();
  });
  it("rejects missing or invalid versions before service operations", async () => {
    for (const version of [undefined, -1, 1.5, "1", Infinity]) {
      for (const channel of [
        "lifecycle:retry",
        "lifecycle:convert",
        "recovery:candidates",
      ])
        expect(() => native.handlers.get(channel)!({}, id, version)).toThrow();
      await expect(
        native.handlers.get("recovery:reparse-candidates")!({}, id, version),
      ).rejects.toThrow();
    }
    for (const channel of [
      "lifecycle:retry",
      "lifecycle:convert",
      "recovery:candidates",
    ])
      expect(() => native.handlers.get(channel)!({}, "invalid", 1)).toThrow();
    expect(() =>
      native.handlers.get("lifecycle:select")!(
        {},
        { intakeId: id, taskId: id, revision: 2 },
      ),
    ).toThrow();
    expect(api.retryInput).not.toHaveBeenCalled();
    expect(api.convertInputToTask).not.toHaveBeenCalled();
    expect(api.selectCandidate).not.toHaveBeenCalled();
    expect(api.getRecoveryCandidates).not.toHaveBeenCalled();
  });
  it("forwards both distinct revisions without weakening direct completion", () => {
    native.handlers.get("lifecycle:retry")!({}, id, 4);
    native.handlers.get("lifecycle:convert")!({}, id, 4);
    native.handlers.get("lifecycle:select")!(
      {},
      { intakeId: id, intakeRevision: 4, taskId: id, revision: 9 },
    );
    expect(api.retryInput).toHaveBeenCalledWith(id, 4);
    expect(api.convertInputToTask).toHaveBeenCalledWith(id, 4);
    expect(api.selectCandidate).toHaveBeenCalledWith({
      intakeId: id,
      intakeRevision: 4,
      taskId: id,
      revision: 9,
    });
  });
});
