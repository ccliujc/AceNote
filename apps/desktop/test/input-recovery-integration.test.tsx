import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DataChangedEvent,
  IntakeChangedEvent,
  LifecycleApi,
  QuickInputApi,
  RecoveryApi,
} from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { IntakeRepository } from "../src/main/intake-repository";
import { TaskRepository } from "../src/main/task-repository";
import { LifecycleService } from "../src/main/lifecycle-service";
import { LifecyclePage } from "../src/renderer/lifecycle-page";
import { TodayPanelApp } from "../src/renderer/quick-input/quick-input-app";

describe("F01 file recovery and two renderer integration", () => {
  it("reopens interrupted input, converts once, synchronizes both views and preserves unrelated drafts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "acenote-f01-two-views-"));
    const filename = join(dir, "test.sqlite");
    let db = createDatabase(filename);
    try {
      const received = new Date("2026-10-30T01:00:00Z");
      const old = new IntakeRepository(db, {
        clock: () => received,
        timeZone: "Asia/Shanghai",
      }).create("中断后仍可找回");
      db.close();
      db = createDatabase(filename);
      const inputs = new IntakeRepository(db),
        tasks = new TaskRepository(db),
        parser = vi.fn();
      const inputListeners = new Set<(event: IntakeChangedEvent) => void>(),
        dataListeners = new Set<(event: DataChangedEvent) => void>();
      const service = new LifecycleService(tasks, inputs, parser, undefined, {
        onChanged: (reason) => dataListeners.forEach((fn) => fn({ reason })),
        onCompleted: vi.fn(),
        onInputChanged: (event) => inputListeners.forEach((fn) => fn(event)),
      });
      service.recoverInterrupted();
      expect(parser).not.toHaveBeenCalled();
      const recovery: RecoveryApi = {
        listInputs: async () => service.listRecoverableInputs(),
        getRecoverableSummary: async () => service.getRecoverableSummary(),
        getCandidates: async (id, rev) =>
          service.getRecoveryCandidates(id, rev),
        reparseCandidates: (id, rev) =>
          service.reparseRecoveryCandidates(id, rev),
        onInputsChanged: (fn) => {
          inputListeners.add(fn);
          return () => {
            inputListeners.delete(fn);
          };
        },
      };
      const api: LifecycleApi = {
        submitInput: (text) => service.submitInput(text),
        retryInput: (id, rev) => service.retryInput(id, rev),
        convertInputToTask: (id, rev) => service.convertInputToTask(id, rev),
        selectCandidate: (value) => service.selectCandidate(value),
        completeTask: (id, rev) => service.completeTask(id, rev),
        archiveTask: (id, rev) => service.archiveTask(id, rev),
        restoreTask: (id, rev) => service.restoreTask(id, rev),
        listTasks: (date, status) => service.listTasks(date, status),
        getDailySummary: (date) => service.getDailySummary(date),
      };
      const subscribe = (fn: (event: DataChangedEvent) => void) => {
        dataListeners.add(fn);
        return () => {
          dataListeners.delete(fn);
        };
      };
      const quick: QuickInputApi = {
        ...api,
        ...recovery,
        listTasks: (date) => api.listTasks(date, "all"),
        getSummary: api.getDailySummary,
        close: vi.fn(),
        focusMain: vi.fn(),
        onDataChanged: (fn) => subscribe(fn),
      };
      const { unmount } = render(
        <>
          <div data-testid="main">
            <LifecyclePage
              api={api}
              recoveryApi={recovery}
              editorApi={{
                updateTask: async (id, patch, rev) =>
                  tasks.update(id, patch, rev),
              }}
              reminderApi={{
                onReminderDue: () => () => {},
                dismissReminder: vi.fn(),
              }}
              experienceApi={{
                onDataChanged: subscribe,
                onTaskCompleted: () => () => {},
              }}
            />
          </div>
          <div data-testid="floating">
            <TodayPanelApp api={quick} />
          </div>
        </>,
      );
      const main = within(screen.getByTestId("main")),
        floating = within(screen.getByTestId("floating"));
      await main.findByText(old.rawText);
      await floating.findByRole("button", { name: "待处理输入 1" });
      await userEvent.type(main.getByRole("textbox"), "主窗口草稿");
      await userEvent.type(floating.getByRole("textbox"), "浮窗草稿");
      fireEvent.change(main.getByLabelText("记录日期"), {
        target: { value: "2026-10-10" },
      });
      const input = inputs.get(old.id);
      await userEvent.click(
        within(main.getByRole("region", { name: "待处理输入" })).getByRole(
          "button",
          { name: "作为新待办" },
        ),
      );
      await main.findByText("暂无待处理输入");
      await waitFor(() =>
        expect(
          floating.queryByRole("button", { name: "待处理输入 1" }),
        ).not.toBeInTheDocument(),
      );
      expect(main.getByRole("textbox")).toHaveValue("主窗口草稿");
      expect(floating.getByRole("textbox")).toHaveValue("浮窗草稿");
      expect(main.getByLabelText("记录日期")).toHaveValue("2026-10-10");
      expect(tasks.list()).toHaveLength(1);
      expect(tasks.get(old.id)).toMatchObject({
        rawText: old.rawText,
        recordedAt: received.toISOString(),
        recordDate: "2026-10-30",
      });
      await expect(
        service.convertInputToTask(old.id, input.revision),
      ).rejects.toThrow("INPUT_ALREADY_RESOLVED");
      expect(parser).not.toHaveBeenCalled();
      unmount();
      expect(inputListeners.size).toBe(0);
      expect(dataListeners.size).toBe(0);
      db.close();
      db = createDatabase(filename);
      const reopened = new LifecycleService(
        new TaskRepository(db),
        new IntakeRepository(db),
        parser,
      );
      reopened.recoverInterrupted();
      expect(reopened.listRecoverableInputs()).toEqual([]);
      expect(new TaskRepository(db).list()).toHaveLength(1);
    } finally {
      if (db.open) db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
