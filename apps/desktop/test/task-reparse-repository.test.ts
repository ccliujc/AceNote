import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createDatabase } from "../src/main/database";
import { TaskRepository } from "../src/main/task-repository";
import { IntakeRepository } from "../src/main/intake-repository";
let db: Database.Database, tasks: TaskRepository;
let now = new Date("2026-11-01T01:00:00Z");
const fields = {
  title: "新标题",
  dueDate: "2026-11-02",
  dueTime: "12:00",
  contact: "Sam",
};
beforeEach(() => {
  now = new Date("2026-11-01T01:00:00Z");
  db = createDatabase(":memory:");
  tasks = new TaskRepository(db, {
    clock: () => now,
    timeZone: "Asia/Shanghai",
  });
});
afterEach(() => db.close());
describe("atomic reparse field commit", () => {
  it.each(["open", "completed", "archived"] as const)(
    "preserves %s identity, metadata and input records",
    (status) => {
      const inputs = new IntakeRepository(db);
      inputs.create("独立输入");
      let before = tasks.create("原文");
      before = tasks.update(before.id, { title: "编辑标题" }, before.revision);
      if (status === "completed")
        before = tasks.complete(before.id, before.revision);
      if (status === "archived")
        before = tasks.archive(before.id, before.revision);
      const intakeRows = db.prepare("SELECT * FROM intake_events").all();
      const summary = tasks.dailyCompletionSummary("2026-11-01");
      now = new Date("2026-11-08T01:00:00Z");
      const committed = tasks.reparse(
        before.id,
        before.revision,
        "replace",
        fields,
      );
      expect(committed.before).toEqual(before);
      expect(committed.task).toEqual({
        ...before,
        ...fields,
        parseStatus: "succeeded",
        parseError: null,
        updatedAt: now.toISOString(),
        revision: before.revision + 1,
      });
      expect(tasks.list()).toHaveLength(1);
      expect(tasks.dailyCompletionSummary("2026-11-01")).toEqual(summary);
      expect(db.prepare("SELECT * FROM intake_events").all()).toEqual(
        intakeRows,
      );
    },
  );
  it("rejects a stale revision and keeps a fresh edit", () => {
    const task = tasks.create("原文");
    const edited = tasks.update(
      task.id,
      { title: "新手动修改" },
      task.revision,
    );
    expect(() =>
      tasks.reparse(task.id, task.revision, "replace", fields),
    ).toThrow("CONCURRENT_EDIT");
    expect(tasks.get(task.id)).toEqual(edited);
  });
  it("rolls back if the result read fails after an update", () => {
    const before = tasks.create("原文");
    const realGet = tasks.get.bind(tasks);
    let reads = 0;
    const spy = vi.spyOn(tasks, "get").mockImplementation((id) => {
      if (++reads === 2) throw new Error("injected read failure");
      return realGet(id);
    });
    expect(() =>
      tasks.reparse(before.id, before.revision, "replace", fields),
    ).toThrow();
    spy.mockRestore();
    expect(tasks.get(before.id)).toEqual(before);
  });
  it("keeps all columns on write failure and invalid merged data", () => {
    const before = tasks.create("原文");
    db.exec(
      "CREATE TRIGGER fail_reparse BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'write failure'); END;",
    );
    expect(() => tasks.reparse(before.id, 0, "replace", fields)).toThrow();
    expect(tasks.get(before.id)).toEqual(before);
    db.exec("DROP TRIGGER fail_reparse");
    expect(() =>
      tasks.reparse(before.id, 0, "preserve", { ...fields, dueDate: null }),
    ).toThrow();
    expect(tasks.get(before.id)).toEqual(before);
  });
  it("rejects a failed conditional write without returning a fictitious result", () => {
    const before = tasks.create("原文");
    vi.spyOn(tasks, "applyParseResult").mockReturnValue(null);
    expect(() => tasks.reparse(before.id, 0, "replace", fields)).toThrow(
      "CONCURRENT_EDIT",
    );
    expect(tasks.get(before.id)).toEqual(before);
  });
});
