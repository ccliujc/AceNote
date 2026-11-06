import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ActiveReminderState,
  DataChangedEvent,
  LifecycleApi,
  PetApi,
  QuickInputApi,
  RecoveryApi,
  ReminderApi,
  ReminderDueEvent,
  TaskCompletedEvent,
} from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { TaskRepository } from "../src/main/task-repository";
import { IntakeRepository } from "../src/main/intake-repository";
import { LifecycleService } from "../src/main/lifecycle-service";
import { ReminderRepository } from "../src/main/reminder-repository";
import { ReminderService } from "../src/main/reminder-service";
import { ReminderScheduler } from "../src/main/reminder-scheduler";
import { ActiveReminderService } from "../src/main/active-reminder-service";
import { LifecyclePage } from "../src/renderer/lifecycle-page";
import { PetApp } from "../src/renderer/pet/pet-app";
import { TodayPanelApp } from "../src/renderer/quick-input/quick-input-app";
afterEach(() => vi.useRealTimers());
function bus<T>() {
  const listeners = new Set<(event: T) => void>();
  return {
    listeners,
    emit: (event: T) => listeners.forEach((fn) => fn(event)),
    subscribe: (fn: (event: T) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
describe("F02 real file, service, main, pet and floating integration", () => {
  it("finds a missed live event, closes authoritatively, protects reactivation and keeps F01 and drafts through completion and reopen", async () => {
    vi.useFakeTimers();
    let clock = new Date("2026-11-04T01:00:00Z");
    vi.setSystemTime(clock);
    const dir = mkdtempSync(join(tmpdir(), "acenote-f02-views-")),
      filename = join(dir, "fixture.sqlite");
    let db = createDatabase(filename);
    let scheduler: ReminderScheduler | undefined,
      active: ActiveReminderService | undefined;
    let petView: ReturnType<typeof render> | undefined,
      mainView: ReturnType<typeof render> | undefined;
    try {
      const tasks = new TaskRepository(db, {
        clock: () => clock,
        timeZone: "Asia/Shanghai",
      });
      const inputs = new IntakeRepository(db, {
        clock: () => clock,
        timeZone: "Asia/Shanghai",
      });
      const old = tasks.create("历史事项");
      const task = tasks.update(
        old.id,
        { dueDate: "2026-11-05", dueTime: "10:00" },
        old.revision,
      );
      const savedInput = inputs.create("F01 中断原文");
      clock = new Date("2026-11-05T01:00:00Z");
      vi.setSystemTime(clock);
      const plans = new ReminderRepository(db, { clock: () => clock });
      const planService = new ReminderService(tasks, plans, {
        clock: () => clock,
      });
      planService.syncTask(task.id);
      const stateEvents = bus<ActiveReminderState>(),
        dueEvents = bus<ReminderDueEvent>(),
        completedEvents = bus<TaskCompletedEvent>(),
        dataEvents = bus<DataChangedEvent>();
      active = new ActiveReminderService(tasks, plans, {
        onChanged: stateEvents.emit,
        onDue: dueEvents.emit,
      });
      const authority = active;
      const service = new LifecycleService(
        tasks,
        inputs,
        vi.fn(),
        planService,
        {
          onTaskChanged: (task) => authority.reconcileTask(task),
          onChanged: (reason) => dataEvents.emit({ reason }),
          onCompleted: (task) =>
            completedEvents.emit({ taskId: task.id, title: task.title }),
        },
      );
      service.recoverInterrupted();
      const originalInput = inputs.get(savedInput.id);
      const read = {
        getActiveReminders: async () => authority.getActiveReminders(),
        onActiveRemindersChanged: stateEvents.subscribe,
      };
      const reminder: ReminderApi = {
        ...read,
        dismissReminder: async (ref) => authority.dismissReminder(ref),
      };
      const pet: PetApi = {
        ...read,
        onReminderDue: dueEvents.subscribe,
        onTaskCompleted: completedEvents.subscribe,
        onDataChanged: dataEvents.subscribe,
        openToday: vi.fn(),
        focusMain: vi.fn(),
        startDrag: vi.fn(),
        dragTo: vi.fn(),
        endDrag: vi.fn(),
        setInteractive: vi.fn(),
      };
      window.pet = pet;
      petView = render(<PetApp />);
      await act(async () => {});
      scheduler = new ReminderScheduler(plans, vi.fn(), {
        clock: () => clock,
        sessionStartedAt: clock,
        claim: (view) => authority.claim(view),
        beforePoll: () => authority.reconcile(),
      });
      scheduler.start();
      clock = new Date("2026-11-05T02:00:00Z");
      vi.setSystemTime(clock);
      await act(async () => {
        await scheduler!.poll();
      });
      expect(screen.getByRole("status")).toHaveTextContent("历史事项");
      const first = authority.getActiveReminders(),
        firstItem = first.reminders[0]!;
      act(() => vi.advanceTimersByTime(15_000));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      const api: LifecycleApi = {
        submitInput: (t) => service.submitInput(t),
        retryInput: (id, rev) => service.retryInput(id, rev),
        convertInputToTask: (id, rev) => service.convertInputToTask(id, rev),
        selectCandidate: (input) => service.selectCandidate(input),
        completeTask: (id, rev) => service.completeTask(id, rev),
        archiveTask: (id, rev) => service.archiveTask(id, rev),
        restoreTask: (id, rev) => service.restoreTask(id, rev),
        listTasks: (date, status) => service.listTasks(date, status),
        getDailySummary: (date) => service.getDailySummary(date),
      };
      const recovery: RecoveryApi = {
        listInputs: async () => service.listRecoverableInputs(),
        getRecoverableSummary: async () => service.getRecoverableSummary(),
        getCandidates: async (id, rev) =>
          service.getRecoveryCandidates(id, rev),
        reparseCandidates: (id, rev) =>
          service.reparseRecoveryCandidates(id, rev),
        onInputsChanged: () => () => {},
      };
      const quick: QuickInputApi = {
        ...api,
        ...recovery,
        listTasks: (date) => api.listTasks(date, "all"),
        getSummary: api.getDailySummary,
        close: vi.fn(),
        focusMain: vi.fn(),
        onDataChanged: (fn) => dataEvents.subscribe(fn),
      };
      const editor = {
        updateTask: async (...args: Parameters<TaskRepository["update"]>) => {
          const next = tasks.update(...args);
          authority.reconcileTask(next);
          planService.syncTask(next.id);
          dataEvents.emit({ reason: "updated" });
          return next;
        },
      };
      mainView = render(
        <>
          <div data-testid="main">
            <LifecyclePage
              api={api}
              recoveryApi={recovery}
              editorApi={editor}
              reminderApi={reminder}
              experienceApi={{
                onDataChanged: dataEvents.subscribe,
                onTaskCompleted: completedEvents.subscribe,
              }}
            />
          </div>
          <div data-testid="float">
            <TodayPanelApp api={quick} />
          </div>
        </>,
      );
      await act(async () => {});
      const main = within(screen.getByTestId("main")),
        floating = within(screen.getByTestId("float"));
      expect(
        main.getByRole("button", { name: "关闭提醒 历史事项" }),
      ).toBeInTheDocument();
      fireEvent.change(main.getByRole("textbox"), {
        target: { value: "完整记录草稿" },
      });
      fireEvent.change(floating.getByRole("textbox"), {
        target: { value: "浮窗草稿" },
      });
      fireEvent.change(main.getByLabelText("记录日期"), {
        target: { value: "2026-11-01" },
      });
      fireEvent.click(main.getByRole("button", { name: "已完成" }));
      await act(async () => {});
      vi.spyOn(authority, "dismissReminder").mockImplementationOnce(() => {
        throw new Error("STORAGE_ERROR");
      });
      fireEvent.click(main.getByRole("button", { name: "关闭提醒 历史事项" }));
      await act(async () => {});
      expect(main.getByRole("alert")).toHaveTextContent("关闭失败");
      fireEvent.click(main.getByRole("button", { name: "关闭提醒 历史事项" }));
      await act(async () => {});
      expect(main.getByText("暂无活动提醒")).toBeInTheDocument();
      let changed = tasks.get(task.id);
      await act(async () => {
        changed = await editor.updateTask(
          task.id,
          { dueTime: "11:00" },
          task.revision,
        );
      });
      expect(plans.getForTask(task.id).id).toBe(firstItem.reminder.id);
      clock = new Date("2026-11-05T03:00:00Z");
      vi.setSystemTime(clock);
      await act(async () => {
        await scheduler!.poll();
      });
      const current = authority.getActiveReminders();
      expect(current.reminders[0]!.activationId).not.toBe(
        firstItem.activationId,
      );
      await act(async () => {
        await reminder.dismissReminder({
          sessionId: first.sessionId,
          activationId: firstItem.activationId,
        });
      });
      expect(
        main.getByRole("button", { name: "关闭提醒 历史事项" }),
      ).toBeInTheDocument();
      expect(petView.container.querySelector(".pet-bubble")).toHaveTextContent(
        "历史事项",
      );
      await act(async () => {
        await service.completeTask(changed.id, changed.revision);
      });
      expect(main.getByText("暂无活动提醒")).toBeInTheDocument();
      expect(petView.container.querySelector(".pet-bubble")).toHaveTextContent(
        "完成",
      );
      expect(main.getByRole("textbox")).toHaveValue("完整记录草稿");
      expect(floating.getByRole("textbox")).toHaveValue("浮窗草稿");
      expect(main.getByLabelText("记录日期")).toHaveValue("2026-11-01");
      expect(main.getByRole("button", { name: "已完成" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(inputs.get(savedInput.id)).toEqual(originalInput);
      expect(tasks.get(task.id).recordDate).toBe("2026-11-04");
      expect(tasks.dailyCompletionSummary("2026-11-05").completedCount).toBe(1);
      mainView.unmount();
      petView.unmount();
      scheduler.stop();
      authority.stop();
      expect(stateEvents.listeners.size).toBe(0);
      expect(dueEvents.listeners.size).toBe(0);
      expect(dataEvents.listeners.size).toBe(0);
      db.close();
      db = createDatabase(filename);
      const reopened = new ActiveReminderService(
        new TaskRepository(db),
        new ReminderRepository(db),
      );
      expect(reopened.getActiveReminders().reminders).toEqual([]);
      expect(new IntakeRepository(db).get(savedInput.id)).toEqual(
        originalInput,
      );
    } finally {
      mainView?.unmount();
      petView?.unmount();
      scheduler?.stop();
      active?.stop();
      if (db.open) db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
