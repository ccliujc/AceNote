import { describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { TaskReparseService } from "../src/main/task-reparse-service";
const host = vi.hoisted(() => ({
  events: new Map<string, () => void>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  order: [] as string[],
  db: undefined as Database.Database | undefined,
  parser: vi.fn(),
  createWindows: vi.fn(),
  activate: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    whenReady: () => Promise.resolve(),
    getPath: () => "/tmp/acenote-f03-bootstrap-unused",
    on: (key: string, fn: () => void) => host.events.set(key, fn),
    quit: vi.fn(),
  },
  ipcMain: {
    handle: (key: string, fn: (...args: any[]) => any) =>
      host.handlers.set(key, fn),
  },
}));
vi.mock("../src/main/database", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/main/database")>();
  return {
    createDatabase: () => {
      const db = original.createDatabase(":memory:");
      host.db = db;
      const close = db.close.bind(db);
      vi.spyOn(db, "close").mockImplementation(() => {
        host.order.push("database-close");
        return close();
      });
      return db;
    },
  };
});
vi.mock("../src/main/parse-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/main/parse-queue")>()),
  createIntentParser: () => host.parser,
}));
vi.mock("../src/main/windows/window-manager", () => ({
  WindowManager: class {
    createWindows = host.createWindows;
    activate = host.activate;
    broadcast = vi.fn();
    prepareToQuit() {
      host.order.push("prepare-windows");
    }
  },
}));
describe("F03 actual application bootstrap", () => {
  it("registers one service without starting parsing and stops it before closing the database", async () => {
    const stop = TaskReparseService.prototype.stop;
    const spy = vi
      .spyOn(TaskReparseService.prototype, "stop")
      .mockImplementation(function (this: TaskReparseService) {
        host.order.push("reparse-stop");
        stop.call(this);
      });
    try {
      await import("../src/main/index");
      await Promise.resolve();
      expect(host.createWindows).toHaveBeenCalledOnce();
      expect(host.handlers.has("task:reparse")).toBe(true);
      expect(
        [...host.handlers.keys()].filter((k) => k.startsWith("capture:")),
      ).toEqual([]);
      expect(host.parser).not.toHaveBeenCalled();
      host.events.get("activate")!();
      expect(host.activate).toHaveBeenCalledOnce();
      expect(spy).not.toHaveBeenCalled();
      host.events.get("before-quit")!();
      host.events.get("before-quit")!();
      expect(spy).toHaveBeenCalledOnce();
      expect(host.order.slice(0, 3)).toEqual([
        "prepare-windows",
        "reparse-stop",
        "database-close",
      ]);
      expect(host.db!.open).toBe(false);
      const request = {
        id: "11111111-1111-4111-8111-111111111111",
        revision: 0,
        mode: "preserve",
      };
      expect(await host.handlers.get("task:reparse")!({}, request)).toEqual({
        kind: "failed",
        error: "REPARSE_INTERRUPTED",
      });
    } finally {
      if (host.db?.open) host.events.get("before-quit")?.();
    }
  });
});
