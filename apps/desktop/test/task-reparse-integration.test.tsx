import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transferableAbortController } from "node:util";
import type { AddressInfo } from "node:net";
import type {
  ActiveReminderState,
  DataChangedEvent,
  IntakeChangedEvent,
  LifecycleApi,
  ParseIntentResult,
  ParseRequest,
  PetApi,
  QuickInputApi,
  RecoveryApi,
  ReminderDueEvent,
  TaskCompletedEvent,
  ParsedTask,
} from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { TaskRepository } from "../src/main/task-repository";
import { IntakeRepository } from "../src/main/intake-repository";
import { LifecycleService } from "../src/main/lifecycle-service";
import { TaskReparseService } from "../src/main/task-reparse-service";
import { createIntentParser } from "../src/main/parse-queue";
import { ReminderRepository } from "../src/main/reminder-repository";
import { ReminderService } from "../src/main/reminder-service";
import { ActiveReminderService } from "../src/main/active-reminder-service";
import { defaultTimeOnlyToToday } from "../../server/src/parse/time-only-today";
import { LifecyclePage } from "../src/renderer/lifecycle-page";
import { TodayPanelApp } from "../src/renderer/quick-input/quick-input-app";
import { PetApp } from "../src/renderer/pet/pet-app";
function bus<T>() {
  const listeners = new Set<(event: T) => void>();
  return {
    emit: (event: T) => listeners.forEach((fn) => fn(event)),
    subscribe: (fn: (event: T) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("F03 file, actual HTTP parser and main/float/pet integration", () => {
  it("keeps original context, revisions, F01 and reminder identities through field updates and completion", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Node's real fetch requires its own AbortSignal, not the jsdom realm's.
    vi.stubGlobal(
      "AbortSignal",
      transferableAbortController().signal.constructor,
    );
    let clock = new Date("2026-11-08T01:00:00Z");
    vi.setSystemTime(clock);
    const dir = mkdtempSync(join(tmpdir(), "acenote-f03-views-")),
      file = join(dir, "fixture.sqlite");
    let db = createDatabase(file),
      view: ReturnType<typeof render> | undefined;
    const requests: ParseRequest[] = [];
    let next: ParseIntentResult = {
      intent: "create",
      task: { title: "吃饭", dueDate: null, dueTime: null, contact: null },
    };
    let held: ReturnType<typeof gate> | null = null;
    const gates: ReturnType<typeof gate>[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body) as ParseRequest;
      const selected = next,
        wait = held;
      held = null;
      requests.push(input);
      if (wait) await wait.promise;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          requestId: input.requestId,
          result: defaultTimeOnlyToToday(selected, input),
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const parser = createIntentParser(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    );
    const tasks = new TaskRepository(db, {
        clock: () => clock,
        timeZone: "Asia/Shanghai",
      }),
      inputs = new IntakeRepository(db, {
        clock: () => clock,
        timeZone: "Asia/Shanghai",
      });
    const plans = new ReminderRepository(db, { clock: () => clock }),
      planService = new ReminderService(tasks, plans, { clock: () => clock });
    const states = bus<ActiveReminderState>(),
      dues = bus<ReminderDueEvent>(),
      completed = bus<TaskCompletedEvent>(),
      data = bus<DataChangedEvent>(),
      inputEvents = bus<IntakeChangedEvent>();
    const active = new ActiveReminderService(tasks, plans, {
      onChanged: states.emit,
      onDue: dues.emit,
    });
    const dueSpy = vi.fn(),
      completionSpy = vi.fn();
    dues.subscribe(dueSpy);
    completed.subscribe(completionSpy);
    const lifecycle = new LifecycleService(tasks, inputs, parser, planService, {
      onTaskChanged: (task) => active.reconcileTask(task),
      onChanged: (reason) => data.emit({ reason }),
      onCompleted: (task) =>
        completed.emit({ taskId: task.id, title: task.title }),
      onInputChanged: inputEvents.emit,
    });
    const reparse = new TaskReparseService(tasks, parser, {
      onTaskChanged: (task) => active.reconcileTask(task),
      syncTask: (id) => planService.syncTask(id),
      onChanged: () => data.emit({ reason: "updated" }),
    });
    try {
      const a = tasks.create("12点吃饭", {
        recordedAt: new Date("2026-11-01T01:00:00Z"),
        timeZone: "Asia/Shanghai",
      });
      const b0 = tasks.create("本日活动任务");
      const fields: ParsedTask = {
        title: "本日活动任务",
        dueDate: "2026-11-08",
        dueTime: "10:00",
        contact: null,
      };
      const b = tasks.applyParseResult(b0.id, 0, fields)!;
      planService.syncTask(b.id);
      const cInput = inputs.create("F01并发原文"),
        c = tasks.create(cInput.rawText, { id: cInput.id });
      const untouched = inputs.create("无关失败原文");
      inputs.markFailed(untouched.id, "NETWORK_ERROR", untouched.revision);
      const initialInputs = db
        .prepare("SELECT * FROM intake_events ORDER BY id")
        .all();
      const api: LifecycleApi = {
        submitInput: (text) => lifecycle.submitInput(text),
        retryInput: (id, rev) => lifecycle.retryInput(id, rev),
        convertInputToTask: (id, rev) => lifecycle.convertInputToTask(id, rev),
        listTasks: (date, status) => lifecycle.listTasks(date, status),
        getDailySummary: (date) => lifecycle.getDailySummary(date),
        selectCandidate: (input) => lifecycle.selectCandidate(input),
        completeTask: (id, rev) => lifecycle.completeTask(id, rev),
        archiveTask: (id, rev) => lifecycle.archiveTask(id, rev),
        restoreTask: (id, rev) => lifecycle.restoreTask(id, rev),
      };
      const recovery: RecoveryApi = {
        listInputs: async () => lifecycle.listRecoverableInputs(),
        getRecoverableSummary: async () => lifecycle.getRecoverableSummary(),
        getCandidates: async (id, rev) =>
          lifecycle.getRecoveryCandidates(id, rev),
        reparseCandidates: (id, rev) =>
          lifecycle.reparseRecoveryCandidates(id, rev),
        onInputsChanged: inputEvents.subscribe,
      };
      const read = {
        getActiveReminders: async () => active.getActiveReminders(),
        onActiveRemindersChanged: states.subscribe,
      };
      window.pet = {
        ...read,
        onReminderDue: dues.subscribe,
        onTaskCompleted: completed.subscribe,
        onDataChanged: data.subscribe,
        openToday: vi.fn(),
        focusMain: vi.fn(),
        startDrag: vi.fn(),
        dragTo: vi.fn(),
        endDrag: vi.fn(),
        setInteractive: vi.fn(),
      } satisfies PetApi;
      const quick: QuickInputApi = {
        ...api,
        ...recovery,
        listTasks: (date) => api.listTasks(date, "all"),
        getSummary: api.getDailySummary,
        close: vi.fn(),
        focusMain: vi.fn(),
        onDataChanged: data.subscribe,
      };
      view = render(
        <>
          <div data-testid="main">
            <LifecyclePage
              api={api}
              recoveryApi={recovery}
              reparseApi={reparse}
              editorApi={{
                updateTask: async (...args) => tasks.update(...args),
              }}
              reminderApi={{
                ...read,
                dismissReminder: async (ref) => active.dismissReminder(ref),
              }}
              experienceApi={{
                onDataChanged: data.subscribe,
                onTaskCompleted: completed.subscribe,
              }}
            />
          </div>
          <div data-testid="float">
            <TodayPanelApp api={quick} />
          </div>
          <div data-testid="pet">
            <PetApp />
          </div>
        </>,
      );
      await act(async () => {});
      const main = within(screen.getByTestId("main")),
        floating = within(screen.getByTestId("float"));
      fireEvent.change(main.getByRole("textbox"), {
        target: { value: "完整记录草稿" },
      });
      fireEvent.change(floating.getByRole("textbox"), {
        target: { value: "浮窗草稿" },
      });
      fireEvent.change(main.getByLabelText("记录日期"), {
        target: { value: a.recordDate },
      });
      await main.findByRole("heading", { name: a.title });
      fireEvent.click(main.getByRole("button", { name: "重新识别" }));
      fireEvent.click(
        within(main.getByRole("dialog")).getByRole("button", {
          name: /保留修改/,
        }),
      );
      await main.findByText("重新识别已保存。");
      expect(tasks.get(a.id)).toMatchObject({
        title: a.title,
        dueDate: "2026-11-01",
        dueTime: "12:00",
        recordDate: a.recordDate,
      });
      expect(requests[0]).toMatchObject({
        rawText: a.rawText,
        localDateTime: a.recordedAt,
        timeZone: a.timeZone,
      });
      expect(() => plans.getForTask(a.id)).toThrow("NOT_FOUND");
      clock = new Date("2026-11-08T02:00:00Z");
      vi.setSystemTime(clock);
      await act(async () => {
        active.claim(plans.listDue(clock)[0]!);
      });
      const activation = active.getActiveReminders().reminders[0]!,
        plan = plans.getForTask(b.id);
      fireEvent.change(main.getByLabelText("记录日期"), {
        target: { value: b.recordDate },
      });
      await main.findByRole("heading", { name: b.title });
      async function identifyB(result: ParseIntentResult) {
        next = result;
        const article = within(
          main.getByRole("region", { name: "任务记录" }),
        ).getByRole("article", { name: tasks.get(b.id).title });
        fireEvent.click(
          within(article).getByRole("button", { name: "重新识别" }),
        );
        fireEvent.click(
          within(main.getByRole("dialog")).getByRole("button", {
            name: "覆盖并重新识别",
          }),
        );
      }
      await identifyB({
        intent: "create",
        task: { ...fields, title: "活动标题改名" },
      });
      await waitFor(() => expect(tasks.get(b.id).title).toBe("活动标题改名"));
      await waitFor(() =>
        expect(main.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(active.getActiveReminders().reminders[0]!.activationId).toBe(
        activation.activationId,
      );
      expect(plans.getForTask(b.id)).toEqual(plan);
      expect(dueSpy).toHaveBeenCalledTimes(1);
      expect(
        screen.getByTestId("pet").querySelector(".pet-bubble"),
      ).toHaveTextContent("活动标题改名");
      fireEvent.click(
        main.getByRole("button", { name: "关闭提醒 活动标题改名" }),
      );
      await waitFor(() =>
        expect(active.getActiveReminders().reminders).toEqual([]),
      );
      await identifyB({
        intent: "create",
        task: { ...fields, title: "关闭后改名" },
      });
      await waitFor(() =>
        expect(main.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(active.getActiveReminders().reminders).toEqual([]);
      expect(plans.getForTask(b.id)).toEqual(plan);
      next = { intent: "complete", completionTarget: "其他事项" };
      await identifyB(next);
      expect(
        await within(main.getByRole("dialog")).findByRole("alert"),
      ).toHaveTextContent("完成指令");
      expect(tasks.get(b.id).status).toBe("open");
      expect(completionSpy).not.toHaveBeenCalled();
      fireEvent.click(
        within(main.getByRole("dialog")).getByRole("button", { name: "取消" }),
      );
      await identifyB({
        intent: "create",
        task: { ...fields, title: "未来计划", dueDate: "2026-11-09" },
      });
      await waitFor(() =>
        expect(main.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(plans.getForTask(b.id)).toMatchObject({
        status: "scheduled",
        scheduledAt: "2026-11-09T02:00:00.000Z",
      });
      db.exec(
        "CREATE TRIGGER fail_plan BEFORE UPDATE ON reminders BEGIN SELECT RAISE(ABORT, 'isolated failure'); END;",
      );
      await identifyB({
        intent: "create",
        task: { ...fields, title: "同步异常仍保存", dueDate: "2026-11-10" },
      });
      await main.findByText(/字段已更新，但提醒计划同步未完成/);
      db.exec("DROP TRIGGER fail_plan");
      expect(tasks.get(b.id).dueDate).toBe("2026-11-10");
      expect(plans.listDue(new Date("2026-11-09T03:00:00Z"))).toEqual([]);
      const hold = gate();
      gates.push(hold);
      held = hold;
      const count = requests.length;
      await identifyB({
        intent: "create",
        task: { ...fields, title: "迟到覆盖" },
      });
      await waitFor(() => expect(requests).toHaveLength(count + 1));
      fireEvent.click(
        floating.getByRole("button", { name: "完成事项：同步异常仍保存" }),
      );
      await waitFor(() => expect(tasks.get(b.id).status).toBe("completed"));
      await act(async () => hold.resolve());
      expect(
        await within(main.getByRole("dialog")).findByRole("alert"),
      ).toHaveTextContent("记录已被其他操作更新");
      fireEvent.click(
        within(main.getByRole("dialog")).getByRole("button", { name: "取消" }),
      );
      expect(tasks.get(b.id).title).toBe("同步异常仍保存");
      expect(completionSpy).toHaveBeenCalledTimes(1);
      expect(
        screen.getByTestId("pet").querySelector(".pet-bubble"),
      ).toHaveTextContent("完成");
      expect(main.getByRole("textbox")).toHaveValue("完整记录草稿");
      expect(floating.getByRole("textbox")).toHaveValue("浮窗草稿");
      expect(
        db.prepare("SELECT * FROM intake_events ORDER BY id").all(),
      ).toEqual(initialInputs);
      const pause = gate();
      gates.push(pause);
      held = pause;
      next = { intent: "create", task: { ...fields, title: "旧 F03 结果" } };
      const pending = reparse.reparseTask({
        id: c.id,
        revision: c.revision,
        mode: "replace",
      });
      const beforeCount = requests.length;
      await waitFor(() => expect(requests.length).toBeGreaterThan(beforeCount));
      next = {
        intent: "create",
        task: {
          title: "F01最新结果",
          dueDate: null,
          dueTime: null,
          contact: null,
        },
      };
      await act(async () => {
        await lifecycle.retryInput(cInput.id, cInput.revision);
        pause.resolve();
      });
      expect(await pending).toEqual({
        kind: "failed",
        error: "CONCURRENT_EDIT",
      });
      expect(tasks.get(c.id).title).toBe("F01最新结果");
      expect(tasks.list()).toHaveLength(3);
      expect(inputs.get(untouched.id)).toEqual({
        ...untouched,
        status: "failed",
        error: "NETWORK_ERROR",
        revision: untouched.revision + 1,
      });
      expect(tasks.dailyCompletionSummary("2026-11-08").completedCount).toBe(1);
      expect(main.getByRole("textbox")).toHaveValue("完整记录草稿");
      view.unmount();
      view = undefined;
      reparse.stop();
      lifecycle.stop();
      active.stop();
      db.close();
      db = createDatabase(file);
      const reopened = new TaskRepository(db);
      expect(reopened.get(b.id)).toMatchObject({
        status: "completed",
        title: "同步异常仍保存",
      });
      expect(
        db
          .prepare("SELECT MAX(version) AS version FROM schema_migrations")
          .get(),
      ).toEqual({ version: 4 });
    } finally {
      gates.forEach((g) => g.resolve());
      view?.unmount();
      reparse.stop();
      lifecycle.stop();
      active.stop();
      if (db.open) db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
