import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveReminderReadApi,
  ActiveReminderState,
  PetApi,
  ReminderApi,
  ReminderDueEvent,
  TaskCompletedEvent,
} from "@acenote/contracts";
import { ActiveReminderCenter } from "../src/renderer/active-reminder-center";
import { useActiveReminders } from "../src/renderer/use-active-reminders";
import { PetApp } from "../src/renderer/pet/pet-app";
import {
  activeItem,
  emptyReminderState,
  sessionId,
} from "./active-reminder-fixtures";
const a = activeItem();
const b = activeItem(
  "另一条",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
);
const state = (revision: number, reminders = [a]): ActiveReminderState => ({
  sessionId,
  revision,
  reminders,
});
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function client(initial = state(1)) {
  let current = initial;
  const listeners = new Set<(state: ActiveReminderState) => void>();
  const off = vi.fn();
  const api: ReminderApi = {
    getActiveReminders: vi.fn(async () => current),
    onActiveRemindersChanged: vi.fn((fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        off();
      };
    }),
    dismissReminder: vi.fn(async () => {
      current = state(current.revision + 1, []);
      return current;
    }),
  };
  return {
    api,
    off,
    listeners,
    emit: (next: ActiveReminderState) => {
      current = next;
      act(() => listeners.forEach((fn) => fn(next)));
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("authoritative reminder center", () => {
  it("keeps a due event during the first empty query and does not restore it after closing and remounting", async () => {
    const c = client(emptyReminderState),
      pending = gate<ActiveReminderState>();
    vi.mocked(c.api.getActiveReminders).mockReturnValueOnce(pending.promise);
    const view = render(<ActiveReminderCenter api={c.api} />);
    c.emit(state(1));
    await act(async () => pending.resolve(emptyReminderState));
    await userEvent.click(
      screen.getByRole("button", { name: "关闭提醒 吃饭" }),
    );
    await screen.findByText("暂无活动提醒");
    view.unmount();
    render(<ActiveReminderCenter api={c.api} />);
    await screen.findByText("暂无活动提醒");
    expect(
      screen.queryByRole("button", { name: "关闭提醒 吃饭" }),
    ).not.toBeInTheDocument();
    expect(c.api.dismissReminder).toHaveBeenCalledOnce();
  });
  it("loads an activity missed by the unopened page and refreshes on focus", async () => {
    const c = client();
    render(<ActiveReminderCenter api={c.api} />);
    await screen.findByRole("button", { name: "关闭提醒 吃饭" });
    vi.mocked(c.api.getActiveReminders).mockResolvedValue(state(2, []));
    fireEvent(window, new Event("focus"));
    await screen.findByText("暂无活动提醒");
    expect(c.api.onActiveRemindersChanged).toHaveBeenCalledOnce();
  });
  it("keeps an effective card after closing fails and retries with the exact reference", async () => {
    const c = client();
    vi.mocked(c.api.dismissReminder).mockRejectedValueOnce(
      new Error("STORAGE_ERROR"),
    );
    render(<ActiveReminderCenter api={c.api} />);
    const close = await screen.findByRole("button", { name: "关闭提醒 吃饭" });
    await userEvent.click(close);
    expect(await screen.findByRole("alert")).toHaveTextContent("关闭失败");
    expect(close).toBeEnabled();
    await userEvent.click(close);
    await screen.findByText("暂无活动提醒");
    expect(c.api.dismissReminder).toHaveBeenLastCalledWith({
      sessionId,
      activationId: a.activationId,
    });
  });
  it("does not let an initial stale snapshot resurrect a closed reminder", async () => {
    const c = client(),
      pending = gate<ActiveReminderState>();
    vi.mocked(c.api.getActiveReminders).mockReturnValue(pending.promise);
    render(<ActiveReminderCenter api={c.api} />);
    c.emit(state(2, []));
    await act(async () => pending.resolve(state(1)));
    expect(
      screen.queryByRole("button", { name: "关闭提醒 吃饭" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("暂无活动提醒")).toBeInTheDocument();
  });
  it("does not let an old close response remove a new activation of the same task", async () => {
    const c = client(),
      pending = gate<ActiveReminderState>();
    vi.mocked(c.api.dismissReminder).mockReturnValue(pending.promise);
    render(<ActiveReminderCenter api={c.api} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "关闭提醒 吃饭" }),
    );
    const current = { ...a, activationId: b.activationId };
    c.emit(state(3, [current]));
    await act(async () => pending.resolve(state(2, [])));
    expect(screen.getByRole("button", { name: "关闭提醒 吃饭" })).toBeEnabled();
  });
  it("distinguishes load failure from empty and retries without duplicate subscriptions", async () => {
    const c = client(emptyReminderState);
    vi.mocked(c.api.getActiveReminders).mockRejectedValueOnce(
      new Error("STORAGE_ERROR"),
    );
    render(<ActiveReminderCenter api={c.api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("加载失败");
    expect(screen.queryByText("暂无活动提醒")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重新加载提醒" }));
    await screen.findByText("暂无活动提醒");
    expect(c.api.onActiveRemindersChanged).toHaveBeenCalledOnce();
  });
  it("retains known cards on a failed refresh and releases pending reads on unmount", async () => {
    const c = client();
    render(<ActiveReminderCenter api={c.api} />);
    await screen.findByRole("button", { name: "关闭提醒 吃饭" });
    vi.mocked(c.api.getActiveReminders).mockRejectedValueOnce(
      new Error("offline"),
    );
    await userEvent.click(screen.getByRole("button", { name: "刷新提醒" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "关闭提醒 吃饭" }),
    ).toBeInTheDocument();
  });
  it("ignores late initial responses and old-session events after unmount", async () => {
    const c = client(),
      pending = gate<ActiveReminderState>(),
      observed = vi.fn();
    vi.mocked(c.api.getActiveReminders).mockReturnValue(pending.promise);
    function Probe({ api }: { api: ActiveReminderReadApi }) {
      useActiveReminders(api, observed);
      return null;
    }
    const { unmount } = render(<Probe api={c.api} />);
    unmount();
    await act(async () => pending.resolve(state(1)));
    c.emit(state(3));
    expect(observed).not.toHaveBeenCalled();
    expect(c.off).toHaveBeenCalledOnce();
    expect(c.listeners.size).toBe(0);
  });
  it("ignores an old session after binding current state and avoids duplicated cards", async () => {
    const c = client();
    render(<ActiveReminderCenter api={c.api} />);
    await screen.findByRole("button", { name: "关闭提醒 吃饭" });
    c.emit({ ...state(9, [b]), sessionId: b.activationId });
    c.emit(state(1));
    expect(
      screen.getAllByRole("button", { name: "关闭提醒 吃饭" }),
    ).toHaveLength(1);
    expect(screen.queryByText("另一条")).not.toBeInTheDocument();
  });
});
function petClient(initial = state(1)) {
  const c = client(initial);
  let due!: (event: ReminderDueEvent) => void,
    completed!: (event: TaskCompletedEvent) => void;
  const offDue = vi.fn(),
    offCompleted = vi.fn();
  const api: PetApi = {
    getActiveReminders: c.api.getActiveReminders,
    onActiveRemindersChanged: c.api.onActiveRemindersChanged,
    onReminderDue: (fn) => {
      due = fn;
      return offDue;
    },
    onTaskCompleted: (fn) => {
      completed = fn;
      return offCompleted;
    },
    onDataChanged: () => () => {},
    openToday: vi.fn(),
    focusMain: vi.fn(),
    startDrag: vi.fn(),
    dragTo: vi.fn(),
    endDrag: vi.fn(),
    setInteractive: vi.fn(),
  };
  window.pet = api;
  const view = render(<PetApp />);
  const trigger = (revision = 1, item = a) =>
    act(() => due({ sessionId, revision, ...item }));
  return {
    ...c,
    api,
    ...view,
    trigger,
    completed: (title = "完成事项") =>
      act(() => completed({ taskId: b.reminder.taskId, title })),
    offDue,
    offCompleted,
  };
}
describe("pet activity identity and timing", () => {
  it("does not replay a queried reminder, and auto-hiding does not globally close it", async () => {
    vi.useFakeTimers();
    const p = petClient();
    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    p.trigger();
    expect(screen.getByRole("status")).toHaveTextContent("吃饭");
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(await p.api.getActiveReminders()).toEqual(state(1));
    p.trigger();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("visual dismissal does not reopen on duplicates but a fresh activation can show", async () => {
    vi.useFakeTimers();
    const p = petClient();
    await act(async () => {});
    p.trigger();
    fireEvent.click(screen.getByRole("button", { name: "关闭桌宠消息" }));
    p.trigger();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const next = { ...a, activationId: b.activationId };
    p.emit(state(2, [next]));
    p.trigger(2, next);
    expect(screen.getByRole("status")).toHaveTextContent("吃饭");
    expect(p.api.openToday).not.toHaveBeenCalled();
  });
  it("globally removes only the matching bubble and preserves a later completion deadline", async () => {
    vi.useFakeTimers();
    const p = petClient();
    await act(async () => {});
    p.trigger();
    p.emit(state(2, []));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    p.emit(state(3, [b]));
    p.trigger(3, b);
    p.completed();
    act(() => vi.advanceTimersByTime(5_000));
    p.emit(state(4, []));
    p.emit(state(2, []));
    expect(screen.getByRole("status")).toHaveTextContent("完成事项");
    act(() => vi.advanceTimersByTime(9_999));
    expect(screen.getByRole("status")).toHaveTextContent("完成事项");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("updates the same activation title without extending its timer", async () => {
    vi.useFakeTimers();
    const p = petClient();
    await act(async () => {});
    p.trigger();
    act(() => vi.advanceTimersByTime(10_000));
    p.emit(state(2, [{ ...a, reminder: { ...a.reminder, title: "新标题" } }]));
    expect(screen.getByRole("status")).toHaveTextContent("新标题");
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("validates due messages received during startup against a newer snapshot", async () => {
    vi.useFakeTimers();
    const initial = gate<ActiveReminderState>();
    // Configure the initial read before mounting.
    const c = client();
    vi.mocked(c.api.getActiveReminders).mockReturnValueOnce(initial.promise);
    let due!: (event: ReminderDueEvent) => void;
    window.pet = {
      ...petStub(),
      getActiveReminders: c.api.getActiveReminders,
      onActiveRemindersChanged: c.api.onActiveRemindersChanged,
      onReminderDue: (fn) => {
        due = fn;
        return () => {};
      },
    };
    render(<PetApp />);
    act(() => due({ sessionId, revision: 1, ...a }));
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("吃饭");
    await act(async () => initial.resolve(emptyReminderState));
    expect(screen.getByRole("status")).toHaveTextContent("吃饭");
  });
  it("does not replace a newer completion with a pending startup due response", async () => {
    vi.useFakeTimers();
    const pending = gate<ActiveReminderState>(),
      c = client();
    vi.mocked(c.api.getActiveReminders).mockReturnValue(pending.promise);
    let due!: (event: ReminderDueEvent) => void,
      completed!: (event: TaskCompletedEvent) => void;
    window.pet = {
      ...petStub(),
      getActiveReminders: c.api.getActiveReminders,
      onActiveRemindersChanged: c.api.onActiveRemindersChanged,
      onReminderDue: (fn) => {
        due = fn;
        return () => {};
      },
      onTaskCompleted: (fn) => {
        completed = fn;
        return () => {};
      },
    };
    render(<PetApp />);
    act(() => due({ sessionId, revision: 1, ...a }));
    act(() => completed({ taskId: b.reminder.taskId, title: "稍后完成" }));
    await act(async () => pending.resolve(state(1)));
    expect(screen.getByRole("status")).toHaveTextContent("稍后完成");
    expect(screen.getByRole("status")).not.toHaveTextContent("该上场了");
  });
  it("ignores a delayed closed activation and releases every subscription and timer", async () => {
    vi.useFakeTimers();
    const p = petClient(state(2, []));
    await act(async () => {});
    p.trigger(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    p.completed();
    p.unmount();
    expect(p.off).toHaveBeenCalledOnce();
    expect(p.offDue).toHaveBeenCalledOnce();
    expect(p.offCompleted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
function petStub(): PetApi {
  return {
    getActiveReminders: vi.fn().mockResolvedValue(emptyReminderState),
    onActiveRemindersChanged: () => () => {},
    onReminderDue: () => () => {},
    onTaskCompleted: () => () => {},
    onDataChanged: () => () => {},
    openToday: vi.fn(),
    focusMain: vi.fn(),
    startDrag: vi.fn(),
    dragTo: vi.fn(),
    endDrag: vi.fn(),
    setInteractive: vi.fn(),
  };
}
