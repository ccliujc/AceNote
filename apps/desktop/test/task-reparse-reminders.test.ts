import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { ParsedTask } from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { TaskRepository } from "../src/main/task-repository";
import { ReminderRepository } from "../src/main/reminder-repository";
import { ReminderService } from "../src/main/reminder-service";
import { ActiveReminderService } from "../src/main/active-reminder-service";
import { TaskReparseService } from "../src/main/task-reparse-service";
const fields: ParsedTask = {
  title: "新标题",
  dueDate: "2026-11-02",
  dueTime: "12:00",
  contact: null,
};
let db: Database.Database,
  tasks: TaskRepository,
  plans: ReminderRepository,
  planService: ReminderService,
  active: ActiveReminderService;
let clock: Date;
beforeEach(() => {
  db = createDatabase(":memory:");
  clock = new Date("2026-11-01T01:00:00Z");
  tasks = new TaskRepository(db, {
    clock: () => clock,
    timeZone: "Asia/Shanghai",
  });
  plans = new ReminderRepository(db, { clock: () => clock });
  planService = new ReminderService(tasks, plans, { clock: () => clock });
  active = new ActiveReminderService(tasks, plans);
});
afterEach(() => {
  active.stop();
  db.close();
});
function fixture() {
  const base = tasks.create("原文"),
    task = tasks.applyParseResult(base.id, 0, fields)!;
  planService.syncTask(task.id);
  clock = new Date("2026-11-02T04:00:00Z");
  active.claim(plans.listDue(clock)[0]!);
  return task;
}
function service(result = fields) {
  return new TaskReparseService(
    tasks,
    vi.fn().mockResolvedValue({ intent: "create", task: result }),
    {
      onTaskChanged: (t) => active.reconcileTask(t),
      syncTask: (id) => planService.syncTask(id),
      onChanged: vi.fn(),
    },
  );
}
describe("reparse committed reminder effects", () => {
  it("retains a fired plan and exact activation when only content changes, including a closed reminder", async () => {
    const task = fixture(),
      before = plans.getForTask(task.id),
      snapshot = active.getActiveReminders();
    const first = await service({
      ...fields,
      title: "改名",
      contact: "Sam",
    }).reparseTask({ id: task.id, revision: task.revision, mode: "replace" });
    expect(first.kind).toBe("updated");
    expect(plans.getForTask(task.id)).toEqual(before);
    expect(active.getActiveReminders().reminders[0]).toMatchObject({
      activationId: snapshot.reminders[0]!.activationId,
      reminder: { title: "改名" },
    });
    active.dismissReminder({
      sessionId: snapshot.sessionId,
      activationId: snapshot.reminders[0]!.activationId,
    });
    await service().reparseTask({
      id: task.id,
      revision: tasks.get(task.id).revision,
      mode: "replace",
    });
    expect(active.getActiveReminders().reminders).toEqual([]);
    expect(plans.getForTask(task.id)).toEqual(before);
  });
  it("keeps unchanged fields and their plan intact on successful preserve", async () => {
    const task = fixture(),
      before = plans.getForTask(task.id),
      state = active.getActiveReminders();
    await service().reparseTask({
      id: task.id,
      revision: task.revision,
      mode: "preserve",
    });
    expect(plans.getForTask(task.id)).toEqual(before);
    expect(active.getActiveReminders()).toEqual(state);
  });
  it.each([
    { ...fields, dueDate: "2026-11-03" },
    { ...fields, dueDate: "2026-11-01" },
    { ...fields, dueDate: null, dueTime: null },
  ])("invalidates old activity when due fields change", async (result) => {
    const task = fixture();
    await service(result).reparseTask({
      id: task.id,
      revision: task.revision,
      mode: "replace",
    });
    expect(active.getActiveReminders().reminders).toEqual([]);
    expect(plans.getForTask(task.id).status).toBe(
      result.dueDate === "2026-11-03" ? "scheduled" : "fired",
    );
    expect(plans.listDue(clock)).toEqual([]);
  });
  it.each(["completed", "archived"] as const)(
    "never recreates plans for %s tasks",
    async (status) => {
      const base = tasks.create("原文");
      const task =
        status === "completed"
          ? tasks.complete(base.id, 0)
          : tasks.archive(base.id, 0);
      await service().reparseTask({
        id: task.id,
        revision: task.revision,
        mode: "replace",
      });
      expect(tasks.get(task.id).status).toBe(status);
      expect(() => plans.getForTask(task.id)).toThrow("NOT_FOUND");
    },
  );
  it("isolates plan and delivery failures after reconciling a committed task", async () => {
    const task = fixture(),
      order: string[] = [];
    const runner = new TaskReparseService(
      tasks,
      vi
        .fn()
        .mockResolvedValue({
          intent: "create",
          task: { ...fields, dueDate: "2026-11-03" },
        }),
      {
        onTaskChanged: (t) => {
          order.push("active");
          active.reconcileTask(t);
        },
        syncTask: () => {
          order.push("plan");
          throw new Error("secret");
        },
        onChanged: () => {
          order.push("broadcast");
          throw new Error("send failed");
        },
      },
    );
    expect(
      await runner.reparseTask({
        id: task.id,
        revision: task.revision,
        mode: "replace",
      }),
    ).toMatchObject({ kind: "updated", warning: "REMINDER_SYNC_FAILED" });
    expect(order).toEqual(["active", "plan", "broadcast"]);
    expect(active.getActiveReminders().reminders).toEqual([]);
    expect(tasks.get(task.id).dueDate).toBe("2026-11-03");
  });
  it("continues to notify if an active-view callback fails", async () => {
    const task = fixture(),
      onChanged = vi.fn();
    const runner = new TaskReparseService(
      tasks,
      vi.fn().mockResolvedValue({ intent: "create", task: fields }),
      {
        onTaskChanged: () => {
          throw new Error("send failed");
        },
        onChanged,
      },
    );
    expect(
      (
        await runner.reparseTask({
          id: task.id,
          revision: task.revision,
          mode: "replace",
        })
      ).kind,
    ).toBe("updated");
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
