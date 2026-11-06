import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { LifecycleTask } from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { TaskRepository } from "../src/main/task-repository";
import { IntakeRepository } from "../src/main/intake-repository";
import { ReminderRepository } from "../src/main/reminder-repository";
import { ReminderService } from "../src/main/reminder-service";
import { ReminderScheduler } from "../src/main/reminder-scheduler";
import { ActiveReminderService } from "../src/main/active-reminder-service";
import { LifecycleService } from "../src/main/lifecycle-service";

let db: Database.Database,
  tasks: TaskRepository,
  plans: ReminderRepository,
  active: ActiveReminderService;
let clock: Date;
const dirs: string[] = [];
let events: {
  onChanged: ReturnType<typeof vi.fn>;
  onDue: ReturnType<typeof vi.fn>;
};
function setup() {
  tasks = new TaskRepository(db, {
    clock: () => clock,
    timeZone: "Asia/Shanghai",
  });
  plans = new ReminderRepository(db, { clock: () => clock });
  events = { onChanged: vi.fn(), onDue: vi.fn() };
  active = new ActiveReminderService(tasks, plans, events);
}
beforeEach(() => {
  clock = new Date("2026-11-05T01:00:00Z");
  db = createDatabase(":memory:");
  setup();
});
afterEach(() => {
  vi.useRealTimers();
  if (db.open) db.close();
  dirs.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true }));
});
function schedule(title = "吃饭", dueTime = "10:00", dueDate = "2026-11-05") {
  const task = tasks.create(title);
  const next = tasks.update(task.id, { dueDate, dueTime }, task.revision);
  new ReminderService(tasks, plans, { clock: () => clock }).syncTask(next.id);
  return next;
}
function fire(task: LifecycleTask, token?: string) {
  const plan = plans.getForTask(task.id);
  clock = new Date(plan.scheduledAt);
  const candidate = plans.listDue(clock).find((r) => r.taskId === task.id)!;
  expect(candidate).toBeDefined();
  expect(active.claim(candidate, token)).not.toBeNull();
  return active
    .getActiveReminders()
    .reminders.find((r) => r.reminder.taskId === task.id)!;
}
function reference(activationId: string) {
  return { sessionId: active.sessionId, activationId };
}

describe("session activity authority", () => {
  it("retains unseen-window reminders, sorts them and isolates returned snapshots", () => {
    const early = schedule("早", "10:00"),
      late = schedule("晚", "11:00");
    fire(late);
    fire(early);
    const state = active.getActiveReminders();
    expect(state.reminders.map((r) => r.reminder.title)).toEqual(["早", "晚"]);
    state.reminders.length = 0;
    expect(active.getActiveReminders().reminders).toHaveLength(2);
    expect(events.onChanged.mock.calls[0]![0].reminders).toHaveLength(1);
    expect(events.onDue).toHaveBeenCalledTimes(2);
  });
  it("does not register a lost claim or replay a closed activation", () => {
    const task = schedule(),
      token = randomUUID();
    clock = new Date("2026-11-05T02:00:00Z");
    const view = plans.listDue(clock)[0]!;
    vi.spyOn(plans, "claim").mockReturnValueOnce(null);
    expect(active.claim(view, token)).toBeNull();
    expect(active.getActiveReminders().revision).toBe(0);
    expect(active.claim(view, token)).not.toBeNull();
    active.dismissReminder(reference(token));
    expect(active.claim(view, token)).toBeNull();
    expect(plans.getForTask(task.id).status).toBe("fired");
    expect(events.onDue).toHaveBeenCalledOnce();
    expect(active.getActiveReminders().reminders).toEqual([]);
  });
  it("closes once across clients without touching tasks, plans or completion totals", async () => {
    const task = schedule(),
      item = fire(task);
    const original = tasks.get(task.id),
      originalPlan = plans.getForTask(task.id);
    const results = await Promise.all([
      Promise.resolve().then(() =>
        active.dismissReminder(reference(item.activationId)),
      ),
      Promise.resolve().then(() =>
        active.dismissReminder(reference(item.activationId)),
      ),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.revision).toBe(2);
    expect(tasks.get(task.id)).toEqual(original);
    expect(plans.getForTask(task.id)).toEqual(originalPlan);
    expect(tasks.dailyCompletionSummary("2026-11-05").completedCount).toBe(0);
    expect(() =>
      active.dismissReminder({
        sessionId: randomUUID(),
        activationId: item.activationId,
      }),
    ).toThrow("CONCURRENT_EDIT");
    expect(() => active.dismissReminder(task.id as any)).toThrow();
    expect(events.onChanged).toHaveBeenCalledTimes(2);
  });
  it("rejects stale closure after the same database ID is rescheduled and fires again", () => {
    const task = schedule(),
      old = fire(task),
      id = plans.getForTask(task.id).id;
    const changed = tasks.update(task.id, { dueTime: "11:00" }, task.revision);
    active.reconcileTask(changed);
    new ReminderService(tasks, plans, { clock: () => clock }).syncTask(task.id);
    expect(plans.getForTask(task.id).id).toBe(id);
    const current = fire(changed);
    expect(current.activationId).not.toBe(old.activationId);
    const result = active.dismissReminder(reference(old.activationId));
    expect(result.reminders).toEqual([current]);
    expect(events.onDue).toHaveBeenCalledTimes(2);
  });
  it("keeps registration and closure when notification delivery fails", () => {
    events.onChanged.mockImplementation(() => {
      throw new Error("window gone");
    });
    events.onDue.mockImplementation(() => {
      throw new Error("window gone");
    });
    const task = schedule(),
      item = fire(task);
    expect(plans.getForTask(task.id).status).toBe("fired");
    active.dismissReminder(reference(item.activationId));
    // Simulate a lost return value and retry the same request.
    expect(
      active.dismissReminder(reference(item.activationId)).reminders,
    ).toEqual([]);
    expect(events.onDue).toHaveBeenCalledOnce();
  });
  it("never commits a partially reconciled batch when a later database read fails", () => {
    const a = schedule("甲"),
      b = schedule("乙");
    fire(a);
    fire(b);
    const before = active.getActiveReminders();
    const completed = tasks.complete(a.id, a.revision);
    const get = tasks.get.bind(tasks);
    const spy = vi.spyOn(tasks, "get").mockImplementation((id) => {
      if (id === b.id) throw new Error("STORAGE_ERROR");
      return get(id);
    });
    expect(() => active.getActiveReminders()).toThrow("STORAGE_ERROR");
    spy.mockRestore();
    tasks.restore(a.id, completed.revision);
    expect(active.getActiveReminders()).toEqual(before);
  });
  it("leaves an effective activity available after a pre-close read error", () => {
    const task = schedule(),
      item = fire(task),
      before = active.getActiveReminders();
    vi.spyOn(plans, "getForTask").mockImplementationOnce(() => {
      throw new Error("STORAGE_ERROR");
    });
    expect(() => active.dismissReminder(reference(item.activationId))).toThrow(
      "STORAGE_ERROR",
    );
    expect(active.getActiveReminders()).toEqual(before);
    expect(
      active.dismissReminder(reference(item.activationId)).reminders,
    ).toEqual([]);
  });
  it.each(["complete", "archive", "clear", "future", "past", "zone"] as const)(
    "invalidates committed %s before any plan write",
    (kind) => {
      const task = schedule(),
        item = fire(task);
      let changed: LifecycleTask;
      if (kind === "complete") changed = tasks.complete(task.id, task.revision);
      else if (kind === "archive")
        changed = tasks.archive(task.id, task.revision);
      else if (kind === "zone") {
        db.prepare("UPDATE tasks SET time_zone=? WHERE id=?").run(
          "America/Los_Angeles",
          task.id,
        );
        changed = tasks.get(task.id);
      } else
        changed = tasks.update(
          task.id,
          kind === "clear"
            ? { dueDate: null, dueTime: null }
            : { dueTime: kind === "future" ? "11:00" : "08:00" },
          task.revision,
        );
      active.reconcileTask(changed);
      expect(active.getActiveReminders().reminders).toEqual([]);
      expect(plans.getForTask(task.id).status).toBe("fired");
      expect(
        active.dismissReminder(reference(item.activationId)).reminders,
      ).toEqual([]);
      if (kind === "complete") {
        active.reconcileTask(tasks.restore(task.id, changed.revision));
        expect(active.getActiveReminders().reminders).toEqual([]);
      }
    },
  );
  it("updates titles without changing activation or replaying due feedback", () => {
    const task = schedule(),
      item = fire(task);
    const changed = tasks.update(
      task.id,
      { title: "新标题", contact: "小王" },
      task.revision,
    );
    active.reconcileTask(changed);
    const state = active.getActiveReminders();
    expect(state.revision).toBe(2);
    expect(state.reminders[0]).toMatchObject({
      activationId: item.activationId,
      reminder: { title: "新标题" },
    });
    expect(events.onDue).toHaveBeenCalledOnce();
    active.reconcile();
    expect(active.getActiveReminders()).toEqual(state);
  });
  it("preserves task success and invalidates activity despite a failed plan synchronization", async () => {
    const task = schedule(),
      item = fire(task);
    const failing = {
      syncTask: vi.fn(() => {
        throw new Error("plan write failed");
      }),
    };
    const service = new LifecycleService(
      tasks,
      new IntakeRepository(db),
      vi.fn(),
      failing,
      {
        onChanged: vi.fn(),
        onCompleted: vi.fn(),
        onTaskChanged: (task) => active.reconcileTask(task),
      },
    );
    const completed = await service.completeTask(task.id, task.revision);
    expect(completed.status).toBe("completed");
    expect(active.getActiveReminders().reminders).toEqual([]);
    expect(
      active.dismissReminder(reference(item.activationId)).reminders,
    ).toEqual([]);
  });
  it("does not clear reminders for a failed task mutation", () => {
    const task = schedule();
    fire(task);
    expect(() => tasks.complete(task.id, task.revision + 1)).toThrow(
      "CONCURRENT_EDIT",
    );
    expect(active.getActiveReminders().reminders).toHaveLength(1);
  });
  it.each(["clear", "reschedule", "past", "zone"] as const)(
    "skips residual %s plans without blocking a valid schedule",
    async (kind) => {
      const stale = schedule("旧"),
        good = schedule("有效");
      if (kind === "zone")
        db.prepare("UPDATE tasks SET time_zone=? WHERE id=?").run(
          "Asia/Hong_Kong",
          stale.id,
        );
      else
        tasks.update(
          stale.id,
          kind === "clear"
            ? { dueDate: null, dueTime: null }
            : { dueTime: kind === "past" ? "08:00" : "11:00" },
          stale.revision,
        );
      clock = new Date("2026-11-05T02:00:00Z");
      const scheduler = new ReminderScheduler(plans, vi.fn(), {
        clock: () => clock,
        claim: (view) => active.claim(view),
      });
      expect(await scheduler.poll()).toHaveLength(1);
      expect(
        active.getActiveReminders().reminders.map((r) => r.reminder.taskId),
      ).toEqual([good.id]);
      expect(plans.claim(plans.getForTask(stale.id).id)).toBeNull();
      scheduler.stop();
    },
  );
  it("starts a fresh activity session over an unchanged version 4 file, retains future plans and never replays fired rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "acenote-f02-file-"));
    dirs.push(dir);
    const file = join(dir, "fixture.sqlite");
    db.close();
    db = createDatabase(file);
    setup();
    const fired = schedule("已触发"),
      closed = schedule("已关闭"),
      missed = schedule("将错过", "23:00"),
      future = schedule("明日", "10:00", "2026-11-06");
    fire(fired);
    const closedItem = fire(closed);
    active.dismissReminder(reference(closedItem.activationId));
    const intakes = new IntakeRepository(db, {
      clock: () => clock,
      timeZone: "Asia/Shanghai",
    });
    const input = intakes.create("F01 原文");
    const savedTasks = tasks.list(),
      savedPlans = db.prepare("SELECT * FROM reminders ORDER BY id").all();
    active.stop();
    db.close();
    db = createDatabase(file);
    clock = new Date("2026-11-06T01:00:00Z");
    setup();
    expect(active.getActiveReminders().reminders).toEqual([]);
    expect(tasks.list()).toEqual(savedTasks);
    expect(db.prepare("SELECT * FROM reminders ORDER BY id").all()).toEqual(
      savedPlans,
    );
    expect(new IntakeRepository(db).get(input.id)).toEqual(input);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get(),
    ).toEqual({ n: 4 });
    const scheduler = new ReminderScheduler(plans, vi.fn(), {
      clock: () => clock,
      sessionStartedAt: clock,
      claim: (v) => active.claim(v),
      beforePoll: () => active.reconcile(),
    });
    scheduler.start();
    await scheduler.poll();
    expect(plans.getForTask(missed.id).status).toBe("missed");
    clock = new Date("2026-11-06T02:00:00Z");
    await scheduler.poll();
    expect(
      active.getActiveReminders().reminders.map((r) => r.reminder.taskId),
    ).toEqual([future.id]);
    expect(events.onDue).toHaveBeenCalledOnce();
    scheduler.stop();
  });
  it("recovers the periodic poll after an initial read failure", async () => {
    vi.useFakeTimers();
    schedule("甲");
    schedule("乙");
    const beforePoll = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("STORAGE_ERROR");
      })
      .mockImplementation(() => active.reconcile());
    const scheduler = new ReminderScheduler(plans, vi.fn(), {
      clock: () => clock,
      intervalMs: 1000,
      claim: (view) => active.claim(view),
      beforePoll,
    });
    scheduler.start();
    clock = new Date("2026-11-05T02:00:00Z");
    await vi.advanceTimersByTimeAsync(1000);
    expect(active.getActiveReminders().reminders).toHaveLength(2);
    scheduler.stop();
    active.stop();
    db.close();
    await vi.advanceTimersByTimeAsync(1000);
  });
  it("does not publish due feedback if shutdown starts during state delivery", () => {
    schedule();
    clock = new Date("2026-11-05T02:00:00Z");
    events.onChanged.mockImplementation(() => active.stop());
    expect(active.claim(plans.listDue(clock)[0]!)).not.toBeNull();
    expect(events.onDue).not.toHaveBeenCalled();
  });
  it.each([
    "archive",
    "restore",
    "parsedCreate",
    "convert",
    "selection",
    "recoveryComplete",
  ] as const)(
    "observes the committed %s path before failed plan writes",
    async (mode) => {
      const task = schedule("周报");
      fire(task);
      const inputs = new IntakeRepository(db, {
        clock: () => clock,
        timeZone: "Asia/Shanghai",
      });
      const onTaskChanged = vi.fn((task: LifecycleTask) =>
        active.reconcileTask(task),
      );
      const service = new LifecycleService(
        tasks,
        inputs,
        async () =>
          mode === "parsedCreate"
            ? {
                intent: "create",
                task: {
                  title: "新任务",
                  dueDate: null,
                  dueTime: null,
                  contact: null,
                },
              }
            : { intent: "complete", completionTarget: "周报" },
        {
          syncTask: () => {
            throw new Error("plan write failed");
          },
        },
        { onChanged: vi.fn(), onCompleted: vi.fn(), onTaskChanged },
      );
      if (mode === "archive") await service.archiveTask(task.id, task.revision);
      else if (mode === "restore") {
        const done = await service.completeTask(task.id, task.revision);
        await service.restoreTask(task.id, done.revision);
      } else if (mode === "parsedCreate") await service.submitInput("新任务");
      else if (mode === "convert") {
        const input = inputs.create("离线记录");
        await service.convertInputToTask(input.id, input.revision);
      } else if (mode === "selection") {
        tasks.create("周报");
        const result = await service.submitInput("周报完成");
        expect(result.kind).toBe("selection_required");
        await service.selectCandidate({
          intakeId: result.intakeId,
          intakeRevision: result.intakeRevision,
          taskId: task.id,
          revision: task.revision,
        });
      } else {
        const input = inputs.create("周报完成");
        const failed = inputs.markFailed(input.id, "NETWORK_ERROR");
        await service.retryInput(failed.id, failed.revision);
      }
      expect(onTaskChanged).toHaveBeenCalled();
      expect(active.getActiveReminders().reminders).toHaveLength(
        mode === "parsedCreate" || mode === "convert" ? 1 : 0,
      );
    },
  );
  it("stops queued polling and session operations before the database closes", async () => {
    const task = schedule();
    const item = fire(task);
    const callback = vi.fn();
    const scheduler = new ReminderScheduler(plans, callback, {
      claim: (v) => active.claim(v),
      beforePoll: () => active.reconcile(),
    });
    scheduler.stop();
    active.stop();
    const eventCount = events.onChanged.mock.calls.length;
    db.close();
    expect(await scheduler.poll()).toEqual([]);
    expect(active.claim(item.reminder)).toBeNull();
    active.reconcile();
    active.reconcileTask(task);
    expect(() => active.getActiveReminders()).toThrow("INVALID_TRANSITION");
    expect(callback).not.toHaveBeenCalled();
    expect(events.onChanged).toHaveBeenCalledTimes(eventCount);
  });
});
