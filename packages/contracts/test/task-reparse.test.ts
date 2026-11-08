import { describe, expect, it } from "vitest";
import {
  taskReparseRequestSchema,
  taskReparseOutcomeSchema,
  taskSchema,
  lifecycleTaskSchema,
  reparseModeSchema,
  type TaskReparseApi,
} from "../src";

const id = "11111111-1111-4111-8111-111111111111";
const task = {
  id,
  rawText: "原文",
  title: "标题",
  recordedAt: "2026-11-01T01:00:00Z",
  recordDate: "2026-11-01",
  dueDate: null,
  dueTime: null,
  timeZone: "Asia/Shanghai",
  contact: null,
  parseStatus: "succeeded",
  parseError: null,
  createdAt: "2026-11-01T01:00:00Z",
  updatedAt: "2026-11-01T01:00:00Z",
  editedAt: null,
  revision: 1,
  status: "open",
  completedAt: null,
  completionDate: null,
  completionTimeZone: null,
  archivedAt: null,
};
describe("existing task reparse contract", () => {
  it("requires a precise id, revision and explicit mode", () => {
    for (const mode of reparseModeSchema.options) {
      expect(taskReparseRequestSchema.parse({ id, revision: 0, mode })).toEqual(
        { id, revision: 0, mode },
      );
    }
    for (const bad of [
      { id: "invalid", revision: 0, mode: "preserve" },
      { id, mode: "replace" },
      ...[-1, 1.5, "1", null].map((revision) => ({
        id,
        revision,
        mode: "preserve",
      })),
      { id, revision: 0, mode: "guess" },
      { id, revision: 0, mode: "preserve", rawText: "injected" },
    ])
      expect(taskReparseRequestSchema.safeParse(bad).success).toBe(false);
  });
  it("returns committed tasks of every status and a separate reminder warning", async () => {
    const api: TaskReparseApi = {
      reparseTask: async () =>
        taskReparseOutcomeSchema.parse({
          kind: "updated",
          task,
          warning: null,
        }),
    };
    expect(
      (await api.reparseTask({ id, revision: 0, mode: "replace" })).kind,
    ).toBe("updated");
    for (const status of ["open", "completed", "archived"]) {
      expect(
        taskReparseOutcomeSchema.parse({
          kind: "updated",
          task: { ...task, status },
          warning: "REMINDER_SYNC_FAILED",
        }).kind,
      ).toBe("updated");
    }
  });
  it("rejects malformed outcomes and sensitive or unexpected details", () => {
    for (const bad of [
      { kind: "updated", task },
      { kind: "updated", task, warning: "failed" },
      { kind: "updated", task: { ...task, revision: -1 }, warning: null },
      { kind: "updated", task: { ...task, extra: true }, warning: null },
      { kind: "failed", error: "SQLITE_SECRET" },
      { kind: "failed", error: "STORAGE_ERROR", stack: "secret" },
    ])
      expect(taskReparseOutcomeSchema.safeParse(bad).success).toBe(false);
  });
  it("keeps temporary failures separate from persisted task errors", () => {
    for (const error of [
      "REPARSE_BUSY",
      "REPARSE_UNSUPPORTED_INTENT",
      "REPARSE_INTERRUPTED",
    ]) {
      expect(taskReparseOutcomeSchema.parse({ kind: "failed", error })).toEqual(
        { kind: "failed", error },
      );
      expect(taskSchema.safeParse({ ...task, parseError: error }).success).toBe(
        false,
      );
    }
    expect(lifecycleTaskSchema.parse(task)).toEqual(task);
  });
});
