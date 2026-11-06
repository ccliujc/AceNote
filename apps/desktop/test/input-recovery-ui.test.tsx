import { reminderApiFixture } from "./active-reminder-fixtures";
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  intakeSchema,
  type IntakeChangedEvent,
  type LifecycleApi,
  type LifecycleTask,
  type QuickInputApi,
  type RecoverableInput,
  type RecoveryApi,
} from "@acenote/contracts";
import { RecoverableInputs } from "../src/renderer/recoverable-inputs";
import { LifecyclePage } from "../src/renderer/lifecycle-page";
import { TodayPanelApp } from "../src/renderer/quick-input/quick-input-app";

const id = "11111111-1111-4111-8111-111111111111";
const row: RecoverableInput = {
  ...intakeSchema.parse({
    id,
    rawText: "昨天的原文",
    receivedAt: "2026-10-30T01:00:00Z",
    localDate: "2026-10-30",
    localDateTime: "2026-10-30T01:00:00Z",
    timeZone: "Asia/Shanghai",
    status: "failed",
    intent: null,
    error: "INPUT_INTERRUPTED",
    createdAt: "2026-10-30T01:00:00Z",
    updatedAt: "2026-10-30T01:00:00Z",
    revision: 4,
  }),
  viewState: "interrupted",
  canRetry: true,
  canConvert: true,
  canSelect: false,
};
const candidate = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "写周报",
  recordDate: "2026-10-30",
  contact: null,
  revision: 3,
};
const task = {
  ...candidate,
  rawText: "周报",
  status: "open",
  dueDate: null,
  dueTime: null,
} as LifecycleTask;
function recovery(initial: RecoverableInput[] = [row]) {
  const listeners = new Set<(event: IntakeChangedEvent) => void>();
  const state = { rows: initial };
  const api: RecoveryApi = {
    listInputs: vi.fn(async () => state.rows),
    getRecoverableSummary: vi.fn(async () => ({ count: state.rows.length })),
    getCandidates: vi.fn(async () => ({
      intakeId: id,
      intakeRevision: 4,
      candidates: [candidate],
      requiresReparse: false,
    })),
    reparseCandidates: vi.fn(),
    onInputsChanged: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };
  return {
    api,
    state,
    emit: (event: IntakeChangedEvent) => listeners.forEach((fn) => fn(event)),
    listeners,
  };
}
function lifecycle(): LifecycleApi {
  return {
    submitInput: vi.fn(),
    retryInput: vi.fn(),
    convertInputToTask: vi.fn().mockResolvedValue(task),
    listTasks: vi.fn().mockResolvedValue([]),
    getDailySummary: vi
      .fn()
      .mockResolvedValue({ date: "2026-11-01", completedCount: 0 }),
    selectCandidate: vi
      .fn()
      .mockResolvedValue({ ...task, status: "completed" }),
    completeTask: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
  };
}
const reminderApi = reminderApiFixture();
const experienceApi = {
  onDataChanged: () => () => {},
  onTaskCompleted: () => () => {},
};
function quick(rec: RecoveryApi): QuickInputApi {
  return {
    ...lifecycle(),
    ...rec,
    listTasks: vi.fn().mockResolvedValue([]),
    getSummary: vi
      .fn()
      .mockResolvedValue({ completedCount: 0, date: "2026-11-01" }),
    onDataChanged: () => () => {},
    close: vi.fn(),
    focusMain: vi.fn(),
  };
}

describe("submitted input recovery UI", () => {
  it("shows historical raw input and compatibility details with correct available actions", async () => {
    const rec = recovery([
      { ...row, legacyUnlinked: true },
      {
        ...row,
        id: candidate.id,
        rawText: "正在识别",
        viewState: "processing",
        canRetry: false,
        canConvert: false,
      },
    ]);
    const onViewDate = vi.fn();
    render(
      <RecoverableInputs
        api={rec.api}
        lifecycle={lifecycle()}
        onViewDate={onViewDate}
      />,
    );
    expect(await screen.findByText("昨天的原文")).toBeInTheDocument();
    expect(screen.getByText(/请先核对/)).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("article", { name: "待处理：正在识别" }),
      ).queryByRole("button"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "查看接收日任务" }),
    );
    expect(onViewDate).toHaveBeenCalledWith("2026-10-30");
    expect(rec.api.listInputs).toHaveBeenCalledWith();
  });
  it("distinguishes a query failure from empty and retries loading", async () => {
    const rec = recovery();
    vi.mocked(rec.api.listInputs).mockRejectedValueOnce(new Error("disk"));
    render(<RecoverableInputs api={rec.api} lifecycle={lifecycle()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("加载失败");
    expect(screen.queryByText("暂无待处理输入")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "重新加载待处理输入" }),
    );
    expect(await screen.findByText(row.rawText)).toBeInTheDocument();
  });
  it("rejects an old query arriving after a new input snapshot", async () => {
    const rec = recovery([]);
    let resolve!: (rows: RecoverableInput[]) => void;
    vi.mocked(rec.api.listInputs).mockReturnValueOnce(
      new Promise((r) => (resolve = r)),
    );
    render(<RecoverableInputs api={rec.api} lifecycle={lifecycle()} />);
    act(() => rec.emit({ intakeId: id, revision: 5, status: "resolved" }));
    await screen.findByText("暂无待处理输入");
    await act(async () => resolve([row]));
    expect(screen.queryByText(row.rawText)).not.toBeInTheDocument();
  });
  it("requires confirmation for one candidate, permits cancellation and retries with refreshed versions", async () => {
    const rec = recovery([
      {
        ...row,
        status: "awaiting_selection",
        viewState: "awaiting_selection",
        canRetry: false,
        canSelect: true,
      },
    ]);
    const life = lifecycle();
    vi.mocked(life.selectCandidate).mockImplementationOnce(async () => {
      rec.state.rows = [{ ...rec.state.rows[0]!, revision: 5 }];
      vi.mocked(rec.api.getCandidates).mockResolvedValue({
        intakeId: id,
        intakeRevision: 5,
        candidates: [{ ...candidate, revision: 6 }],
        requiresReparse: false,
      });
      throw new Error("CONCURRENT_EDIT");
    });
    render(<RecoverableInputs api={rec.api} lifecycle={life} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "继续选择" }),
    );
    expect(life.selectCandidate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(rec.state.rows).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "继续选择" }));
    await userEvent.click(
      screen.getByRole("button", { name: "写周报 2026-10-30" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "内容已发生变化",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "写周报 2026-10-30" }),
    );
    expect(life.selectCandidate).toHaveBeenLastCalledWith({
      intakeId: id,
      intakeRevision: 5,
      taskId: candidate.id,
      revision: 6,
    });
  });
  it("only reparses a legacy candidate when requested and handles zero matches", async () => {
    const rec = recovery([
      {
        ...row,
        viewState: "awaiting_selection",
        canRetry: false,
        canSelect: true,
      },
    ]);
    vi.mocked(rec.api.getCandidates).mockResolvedValue({
      intakeId: id,
      intakeRevision: 4,
      candidates: [],
      requiresReparse: true,
    });
    vi.mocked(rec.api.reparseCandidates).mockResolvedValue({
      intakeId: id,
      intakeRevision: 4,
      candidates: [],
      requiresReparse: false,
    });
    render(<RecoverableInputs api={rec.api} lifecycle={lifecycle()} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "继续选择" }),
    );
    expect(rec.api.reparseCandidates).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "重新识别候选" }));
    expect(
      await screen.findByText(/目前没有匹配的未完成事项/),
    ).toBeInTheDocument();
    expect(rec.api.reparseCandidates).toHaveBeenCalledWith(id, 4);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
  it("keeps retry failures recoverable without reporting success", async () => {
    const rec = recovery();
    const life = lifecycle();
    vi.mocked(life.retryInput).mockResolvedValue({
      kind: "failed",
      intakeId: id,
      intakeRevision: 5,
      error: "PARSE_NOT_CONFIGURED",
      message: "未配置",
    });
    render(<RecoverableInputs api={rec.api} lifecycle={life} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "重试识别" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "尚未配置 DeepSeek",
    );
    expect(screen.getByText(row.rawText)).toBeInTheDocument();
  });
  it("preserves the full-page draft, date and filter through recovery conversion", async () => {
    const rec = recovery();
    const life = lifecycle();
    vi.mocked(life.convertInputToTask).mockImplementation(async () => {
      rec.state.rows = [];
      return task;
    });
    render(
      <LifecyclePage
        api={life}
        editorApi={{ updateTask: vi.fn() }}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
        recoveryApi={rec.api}
      />,
    );
    await screen.findByText(row.rawText);
    fireEvent.change(screen.getByLabelText("记录日期"), {
      target: { value: "2026-10-15" },
    });
    await userEvent.click(screen.getByRole("button", { name: "未完成" }));
    await userEvent.type(screen.getByRole("textbox"), "未提交的新草稿");
    await userEvent.click(
      within(screen.getByRole("region", { name: "待处理输入" })).getByRole(
        "button",
        { name: "作为新待办" },
      ),
    );
    await screen.findByText("暂无待处理输入");
    expect(screen.getByRole("textbox")).toHaveValue("未提交的新草稿");
    expect(screen.getByLabelText("记录日期")).toHaveValue("2026-10-15");
    expect(screen.getByRole("button", { name: "未完成" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(life.convertInputToTask).toHaveBeenCalledWith(id, 4);
  });
  it("updates floating counts and invalidates stale feedback without clearing drafts", async () => {
    const rec = recovery();
    const api = quick(rec.api);
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: "failed",
      intakeId: id,
      intakeRevision: 4,
      error: "NETWORK_ERROR",
      message: "offline",
    });
    render(<TodayPanelApp api={api} />);
    await userEvent.type(screen.getByRole("textbox"), "还未完成的输入");
    await userEvent.click(screen.getByRole("button", { name: "记录" }));
    const entry = await screen.findByRole("button", { name: "待处理输入 1" });
    expect(api.focusMain).not.toHaveBeenCalled();
    await userEvent.click(entry);
    expect(api.focusMain).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "重试识别" }),
    ).toBeInTheDocument();
    rec.state.rows = [];
    act(() => rec.emit({ intakeId: id, revision: 5, status: "resolved" }));
    await screen.findByText("这条输入已在另一处处理，记录已更新。");
    expect(
      screen.queryByRole("button", { name: "重试识别" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("还未完成的输入");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "待处理输入 1" }),
      ).not.toBeInTheDocument(),
    );
  });
  it("reports summary errors and rejects an old floating summary response", async () => {
    const rec = recovery([]);
    const api = quick(rec.api);
    vi.mocked(api.getRecoverableSummary).mockRejectedValueOnce(
      new Error("disk"),
    );
    const { unmount } = render(<TodayPanelApp api={api} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "重新加载待处理数量" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "重新加载待处理数量" }),
      ).not.toBeInTheDocument(),
    );
    unmount();
    expect(rec.listeners.size).toBe(0);
    let resolve!: (value: { count: number }) => void;
    vi.mocked(api.getRecoverableSummary).mockReturnValueOnce(
      new Promise((r) => (resolve = r)),
    );
    render(<TodayPanelApp api={api} />);
    act(() => rec.emit({ intakeId: id, revision: 5, status: "resolved" }));
    await act(async () => resolve({ count: 8 }));
    expect(
      screen.queryByRole("button", { name: "待处理输入 8" }),
    ).not.toBeInTheDocument();
  });
});
