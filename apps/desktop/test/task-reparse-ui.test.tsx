import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  LifecycleApi,
  LifecycleTask,
  TaskReparseApi,
  TaskReparseOutcome,
} from "@acenote/contracts";
import { App } from "../src/renderer/app";
import { TaskReparseDialog } from "../src/renderer/task-reparse-dialog";
import { todayLocal } from "../src/renderer/date-navigator";
import { reminderApiFixture } from "./active-reminder-fixtures";
const reparseTaskFixture: LifecycleTask = {
  id: "11111111-1111-4111-8111-111111111111",
  rawText: "原始文字，明天开会",
  title: "保留的标题",
  recordedAt: "2026-11-01T01:00:00.000Z",
  recordDate: todayLocal(),
  dueDate: null,
  dueTime: null,
  timeZone: "Asia/Shanghai",
  contact: null,
  parseStatus: "succeeded",
  parseError: null,
  createdAt: "2026-11-01T01:00:00.000Z",
  updatedAt: "2026-11-01T01:00:00.000Z",
  editedAt: null,
  revision: 1,
  status: "open",
  completedAt: null,
  completionDate: null,
  completionTimeZone: null,
  archivedAt: null,
};
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(rows = [reparseTaskFixture]) {
  const lifecycle: LifecycleApi = {
    submitInput: vi.fn(),
    retryInput: vi.fn(),
    convertInputToTask: vi.fn(),
    listTasks: vi.fn().mockResolvedValue(rows),
    getDailySummary: vi
      .fn()
      .mockResolvedValue({ date: todayLocal(), completedCount: 2 }),
    selectCandidate: vi.fn(),
    completeTask: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
  };
  const taskReparse: TaskReparseApi = {
    reparseTask: vi
      .fn()
      .mockResolvedValue({
        kind: "updated",
        task: { ...rows[0]!, revision: 2 },
        warning: null,
      }),
  };
  Object.assign(window, {
    lifecycle,
    taskReparse,
    editor: { updateTask: vi.fn() },
    reminder: reminderApiFixture(),
    experience: {
      onDataChanged: vi.fn(() => () => {}),
      onTaskCompleted: vi.fn(() => () => {}),
    },
    recovery: {
      listInputs: vi.fn().mockResolvedValue([]),
      getRecoverableSummary: vi.fn().mockResolvedValue({ count: 0 }),
      onInputsChanged: vi.fn(() => () => {}),
      getCandidates: vi.fn(),
      reparseCandidates: vi.fn(),
    },
  });
  const view = render(<App />);
  return { lifecycle, taskReparse, ...view };
}
async function open() {
  await userEvent.click(
    await screen.findByRole("button", { name: "重新识别" }),
  );
  return screen.getByRole("dialog");
}
describe("F03 current full-records flow", () => {
  it.each(["open", "completed", "archived"] as const)(
    "offers explicit reparse for %s while retaining editing and no calls on cancel",
    async (status) => {
      const { taskReparse } = setup([{ ...reparseTaskFixture, status }]);
      expect(await screen.findByRole("button", { name: "编辑" })).toBeEnabled();
      const dialog = await open();
      expect(dialog).toHaveTextContent(reparseTaskFixture.rawText);
      await userEvent.click(
        within(dialog).getByRole("button", { name: "取消" }),
      );
      expect(taskReparse.reparseTask).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重新识别" })).toHaveFocus();
    },
  );
  it("focuses preserve by default, contains Tab and supports Escape", async () => {
    setup();
    const dialog = await open();
    expect(
      within(dialog).getByRole("button", { name: /保留修改/ }),
    ).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("locks duplicate confirmation and cancellation until the request ends", async () => {
    const { taskReparse } = setup(),
      pending = gate<TaskReparseOutcome>();
    vi.mocked(taskReparse.reparseTask).mockReturnValue(pending.promise);
    const dialog = await open(),
      preserve = within(dialog).getByRole("button", { name: /保留修改/ });
    fireEvent.click(preserve);
    fireEvent.click(preserve);
    expect(taskReparse.reparseTask).toHaveBeenCalledExactlyOnceWith({
      id: reparseTaskFixture.id,
      revision: 1,
      mode: "preserve",
    });
    expect(
      within(dialog).getByRole("button", { name: "覆盖并重新识别" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    await act(async () =>
      pending.resolve({ kind: "failed", error: "NETWORK_ERROR" }),
    );
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeEnabled();
  });
  it.each([
    ["PARSE_NOT_CONFIGURED", "尚未配置 DeepSeek"],
    ["REPARSE_UNSUPPORTED_INTENT", "完成指令"],
    ["PARSE_INVALID_RESPONSE", "格式不正确"],
    ["PARSE_TIMEOUT", "超时"],
  ] as const)(
    "reports %s and retries only when chosen",
    async (error, text) => {
      const { taskReparse, lifecycle } = setup();
      vi.mocked(taskReparse.reparseTask).mockResolvedValueOnce({
        kind: "failed",
        error,
      });
      const dialog = await open();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "覆盖并重新识别" }),
      );
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(text);
      expect(taskReparse.reparseTask).toHaveBeenCalledTimes(1);
      expect(lifecycle.completeTask).not.toHaveBeenCalled();
      await userEvent.click(
        within(dialog).getByRole("button", { name: /保留修改/ }),
      );
      expect(taskReparse.reparseTask).toHaveBeenCalledTimes(2);
      expect(await screen.findByText("重新识别已保存。")).toBeInTheDocument();
    },
  );
  it("refreshes a conflict at the original record date and requires a fresh explicit choice", async () => {
    const { taskReparse, lifecycle } = setup();
    vi.mocked(taskReparse.reparseTask).mockResolvedValueOnce({
      kind: "failed",
      error: "CONCURRENT_EDIT",
    });
    const dialog = await open();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "覆盖并重新识别" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "先刷新",
    );
    expect(
      within(dialog).getByRole("button", { name: /保留修改/ }),
    ).toBeDisabled();
    vi.mocked(lifecycle.listTasks).mockResolvedValueOnce([
      { ...reparseTaskFixture, revision: 4, title: "其他操作已改名" },
    ]);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "刷新记录" }),
    );
    expect(lifecycle.listTasks).toHaveBeenLastCalledWith(
      reparseTaskFixture.recordDate,
      "all",
    );
    expect(
      await within(dialog).findByText("记录已刷新，请重新选择识别方式。"),
    ).toBeInTheDocument();
    expect(taskReparse.reparseTask).toHaveBeenCalledTimes(1);
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保留修改/ }),
    );
    expect(taskReparse.reparseTask).toHaveBeenLastCalledWith({
      id: reparseTaskFixture.id,
      revision: 4,
      mode: "preserve",
    });
  });
  it("keeps errors for failed refresh or a missing task without retrying a model", async () => {
    const { taskReparse, lifecycle } = setup();
    vi.mocked(taskReparse.reparseTask).mockResolvedValueOnce({
      kind: "failed",
      error: "CONCURRENT_EDIT",
    });
    const dialog = await open();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保留修改/ }),
    );
    vi.mocked(lifecycle.listTasks).mockRejectedValueOnce(
      new Error("read failed"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "刷新记录" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "刷新记录失败",
    );
    vi.mocked(lifecycle.listTasks).mockResolvedValueOnce([]);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "刷新记录" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "不存在",
    );
    expect(taskReparse.reparseTask).toHaveBeenCalledTimes(1);
  });
  it("treats transport loss as uncertain and requires verification", async () => {
    const { taskReparse } = setup();
    vi.mocked(taskReparse.reparseTask).mockRejectedValueOnce(
      new Error("transport lost"),
    );
    const dialog = await open();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保留修改/ }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "结果尚未确认",
    );
    expect(
      within(dialog).getByRole("button", { name: "覆盖并重新识别" }),
    ).toBeDisabled();
    expect(taskReparse.reparseTask).toHaveBeenCalledTimes(1);
  });
  it("keeps a committed title, reminder warning, draft and filter when the follow-up refresh fails", async () => {
    const { taskReparse, lifecycle } = setup();
    await screen.findByRole("heading", { name: reparseTaskFixture.title });
    await userEvent.type(screen.getByLabelText("待办或完成指令"), "未提交草稿");
    await userEvent.click(screen.getByRole("button", { name: "未完成" }));
    const dialog = await open();
    vi.mocked(taskReparse.reparseTask).mockResolvedValueOnce({
      kind: "updated",
      task: { ...reparseTaskFixture, title: "更新标题", revision: 2 },
      warning: "REMINDER_SYNC_FAILED",
    });
    vi.mocked(lifecycle.listTasks).mockRejectedValueOnce(
      new Error("read failed"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "覆盖并重新识别" }),
    );
    expect(
      await screen.findByText(/字段已更新，但提醒计划同步未完成/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "更新标题" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("待办或完成指令")).toHaveValue("未提交草稿");
    expect(
      screen.getByRole("button", { name: "未完成", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByText(/记录加载失败/)).toBeInTheDocument();
    expect(taskReparse.reparseTask).toHaveBeenCalledTimes(1);
  });
  it("does not deliver an old operation or refresh into a remounted task dialog", async () => {
    const pending = gate<TaskReparseOutcome>(),
      api = { reparseTask: vi.fn().mockReturnValue(pending.promise) },
      onUpdated = vi.fn();
    const lifecycle = { listTasks: vi.fn() };
    const view = render(
      <TaskReparseDialog
        key="a"
        task={reparseTaskFixture}
        api={api}
        lifecycle={lifecycle}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /保留修改/ }));
    const other = {
      ...reparseTaskFixture,
      id: "33333333-3333-4333-8333-333333333333",
      rawText: "另一条原文",
    };
    view.rerender(
      <TaskReparseDialog
        key="b"
        task={other}
        api={api}
        lifecycle={lifecycle}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );
    await act(async () =>
      pending.resolve({
        kind: "updated",
        task: reparseTaskFixture,
        warning: null,
      }),
    );
    expect(onUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("另一条原文");
    api.reparseTask.mockResolvedValueOnce({
      kind: "failed",
      error: "CONCURRENT_EDIT",
    });
    await userEvent.click(screen.getByRole("button", { name: /保留修改/ }));
    const refresh = gate<LifecycleTask[]>();
    lifecycle.listTasks.mockReturnValueOnce(refresh.promise);
    await userEvent.click(screen.getByRole("button", { name: "刷新记录" }));
    view.rerender(
      <TaskReparseDialog
        key="c"
        task={{ ...reparseTaskFixture, rawText: "新的确认界面" }}
        api={api}
        lifecycle={lifecycle}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );
    await act(async () => refresh.resolve([other]));
    expect(onUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("新的确认界面");
  });
  it("refreshes the current browsing date after a delayed result without inserting an old-day task", async () => {
    const { taskReparse, lifecycle } = setup(),
      pending = gate<TaskReparseOutcome>();
    vi.mocked(taskReparse.reparseTask).mockReturnValueOnce(pending.promise);
    await screen.findByRole("heading", { name: reparseTaskFixture.title });
    await userEvent.type(
      screen.getByLabelText("待办或完成指令"),
      "日期切换草稿",
    );
    const dialog = await open();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保留修改/ }),
    );
    vi.mocked(lifecycle.listTasks).mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText("记录日期"), {
      target: { value: "2026-11-02" },
    });
    await act(async () =>
      pending.resolve({
        kind: "updated",
        task: reparseTaskFixture,
        warning: null,
      }),
    );
    expect(lifecycle.listTasks).toHaveBeenLastCalledWith("2026-11-02", "all");
    expect(screen.getByLabelText("记录日期")).toHaveValue("2026-11-02");
    expect(screen.getByLabelText("待办或完成指令")).toHaveValue("日期切换草稿");
    expect(
      screen.queryByRole("heading", { name: reparseTaskFixture.title }),
    ).not.toBeInTheDocument();
  });
});
