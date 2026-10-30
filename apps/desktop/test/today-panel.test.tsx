import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleTask, QuickInputApi } from '@acenote/contracts';
import { TodayPanelApp } from '../src/renderer/quick-input/quick-input-app';

afterEach(() => vi.useRealTimers());

function makeApi(tasks: LifecycleTask[] = []): Window['today'] {
  return {
    listTasks: vi.fn().mockResolvedValue(tasks),
    submitInput: vi.fn(),
    retryInput: vi.fn(),
    convertInputToTask: vi.fn(),
    completeTask: vi.fn(),
    selectCandidate: vi.fn(),
    getSummary: vi
      .fn()
      .mockResolvedValue({ date: '2026-10-29', completedCount: 2 }),
    close: vi.fn(),
    focusMain: vi.fn(),
    onDataChanged: vi.fn(() => () => {}),
  };
}
describe('TodayPanelApp', () => {
  it('completes the clicked task, refreshes the count and preserves the input draft', async () => {
    const task = {
      id: '11111111-1111-4111-8111-111111111111',
      title: '吃饭',
      revision: 4,
      status: 'open',
      dueDate: null,
      dueTime: null,
    } as LifecycleTask;
    const completed = {
      ...task,
      status: 'completed',
      revision: 5,
    } as LifecycleTask;
    const api = makeApi([task]);
    vi.mocked(api.completeTask).mockImplementation(async () => {
      vi.mocked(api.listTasks).mockResolvedValue([completed]);
      vi.mocked(api.getSummary).mockResolvedValue({
        date: '2026-10-30',
        completedCount: 1,
      });
      return completed;
    });
    render(<TodayPanelApp api={api} />);
    const circle = await screen.findByRole('button', {
      name: '完成事项：吃饭',
    });
    await userEvent.type(screen.getByRole('textbox'), '还没提交的会议草稿');
    await userEvent.click(circle);
    expect(
      await screen.findByRole('button', { name: '已完成：吃饭' }),
    ).toBeDisabled();
    expect(screen.getByText('已完成 1')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('还没提交的会议草稿');
    expect(api.completeTask).toHaveBeenCalledExactlyOnceWith(task.id, 4);
    expect(api.submitInput).not.toHaveBeenCalled();
  });
  it('blocks duplicate completion and hiding, then retains an unfinished task and draft on failure', async () => {
    const task = {
      id: 'task-1',
      title: '吃饭',
      revision: 4,
      status: 'open',
      dueDate: null,
      dueTime: null,
    } as LifecycleTask;
    const api = makeApi([task]);
    let reject!: (reason: Error) => void;
    vi.mocked(api.completeTask).mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    render(<TodayPanelApp api={api} />);
    const circle = await screen.findByRole('button', {
      name: '完成事项：吃饭',
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '保留草稿' },
    });
    fireEvent.click(circle);
    fireEvent.click(circle);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(api.completeTask).toHaveBeenCalledTimes(1);
    expect(api.close).not.toHaveBeenCalled();
    expect(circle).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '记录' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '收起日程浮窗' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: '已完成：吃饭' }),
    ).not.toBeInTheDocument();
    await act(async () => reject(new Error('CONCURRENT_EDIT')));
    expect(await screen.findByRole('alert')).toHaveTextContent('完成失败');
    expect(
      screen.getByRole('button', { name: '完成事项：吃饭' }),
    ).toBeEnabled();
    expect(screen.getByRole('textbox')).toHaveValue('保留草稿');
  });
  it('supports keyboard completion and keeps completed or archived circles disabled', async () => {
    const task = {
      id: 'task-1',
      title: '吃饭',
      revision: 1,
      status: 'open',
      dueDate: null,
      dueTime: null,
    } as LifecycleTask;
    const done = {
      ...task,
      id: 'task-2',
      title: '已经完成',
      status: 'completed',
    } as LifecycleTask;
    const archived = {
      ...task,
      id: 'task-3',
      title: '已经归档',
      status: 'archived',
    } as LifecycleTask;
    const api = makeApi([task, done, archived]);
    vi.mocked(api.completeTask).mockResolvedValue({
      ...task,
      status: 'completed',
    });
    render(<TodayPanelApp api={api} />);
    const circle = await screen.findByRole('button', {
      name: '完成事项：吃饭',
    });
    expect(
      screen.getByRole('button', { name: '已完成：已经完成' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '已归档：已经归档' }),
    ).toBeDisabled();
    circle.focus();
    await userEvent.keyboard('[Space]');
    expect(
      await screen.findByText('“吃饭”已完成，漂亮的一分！'),
    ).toBeInTheDocument();
    expect(api.completeTask).toHaveBeenCalledExactlyOnceWith(
      task.id,
      task.revision,
    );
  });
  it('confirms a future today time in the saved message and task chip', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T03:00:00Z'));
    const task = {
      id: 'future-time',
      title: '吃饭',
      status: 'open',
      dueDate: '2026-10-30',
      dueTime: '12:00',
      timeZone: 'Asia/Shanghai',
    } as LifecycleTask;
    const api = makeApi([task]);
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: 'task',
      intakeId: task.id,
      task,
    });
    render(<TodayPanelApp api={api} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '12点提醒我吃饭' },
    });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(
      await screen.findByText('已记下“吃饭”，时间为今天 12:00。'),
    ).toBeInTheDocument();
    expect(screen.getByText('12:00', { selector: 'time' })).toBeInTheDocument();
    expect(screen.queryByText('已过时间')).not.toBeInTheDocument();
  });
  it('shows the saved time and marks an already-past today time without promising a reminder', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T05:00:00Z'));
    const task = {
      id: 'task-time',
      title: '吃饭',
      status: 'open',
      dueDate: '2026-10-30',
      dueTime: '12:00',
      timeZone: 'Asia/Shanghai',
    } as LifecycleTask;
    const api = makeApi([task]);
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: 'task',
      intakeId: 'task-time',
      task,
    });
    render(<TodayPanelApp api={api} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '12点提醒我吃饭' },
    });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(
      await screen.findByText(
        '已记下“吃饭”，时间为今天 12:00（已过时间，不会补发提醒）。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('12:00', { selector: 'time' })).toBeInTheDocument();
    expect(screen.getByText('已过时间')).toBeInTheDocument();
    expect(api.submitInput).toHaveBeenCalledWith('12点提醒我吃饭');
  });
  it('submits on Enter while preserving Shift+Enter and IME confirmation', async () => {
    const api = makeApi();
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: 'task',
      intakeId: 'enter-intake',
      task: { title: '下午2点开会' } as LifecycleTask,
    });
    render(<TodayPanelApp api={api} />);
    const input = screen.getByRole('textbox', { name: '日程或完成指令' });
    fireEvent.change(input, { target: { value: '下午2点开会' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(api.submitInput).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(
      await screen.findByText('已记下“下午2点开会”。'),
    ).toBeInTheDocument();
    expect(api.submitInput).toHaveBeenCalledExactlyOnceWith('下午2点开会');
  });
  it('submits a schedule from the floating window and clears only on success', async () => {
    const api = makeApi();
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: 'task',
      intakeId: 'intake-1',
      task: { title: '明天下午3点开会' } as LifecycleTask,
    });
    render(<TodayPanelApp api={api} />);
    const input = screen.getByRole('textbox', { name: '日程或完成指令' });
    await userEvent.type(input, '明天下午3点开会');
    await userEvent.click(screen.getByRole('button', { name: '记录' }));
    expect(api.submitInput).toHaveBeenCalledWith('明天下午3点开会');
    expect(
      await screen.findByText('已记下“明天下午3点开会”。'),
    ).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });
  it('preserves an active draft on blur and allows explicit hiding', async () => {
    const api = makeApi();
    render(<TodayPanelApp api={api} />);
    await userEvent.type(screen.getByRole('textbox'), '明天约会议');
    fireEvent.blur(window);
    expect(api.close).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '收起日程浮窗' }));
    expect(api.close).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox')).toHaveValue('明天约会议');
  });
  it('retains the intake for a failed parse and supports retry and conversion', async () => {
    const api = makeApi();
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: 'failed',
      intakeId: 'saved-intake',
      error: 'NETWORK_ERROR',
      message: 'failed',
    });
    vi.mocked(api.retryInput).mockRejectedValue(new Error('offline'));
    vi.mocked(api.convertInputToTask).mockResolvedValue({
      title: '保留原文',
    } as LifecycleTask);
    render(<TodayPanelApp api={api} />);
    await userEvent.type(screen.getByRole('textbox'), '保留原文');
    await userEvent.click(screen.getByRole('button', { name: '记录' }));
    expect(await screen.findByText(/原文已保存/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试识别' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('输入已保留');
    expect(api.retryInput).toHaveBeenCalledWith('saved-intake');
    expect(screen.getByRole('textbox')).toHaveValue('保留原文');
    await userEvent.click(screen.getByRole('button', { name: '作为新待办' }));
    expect(api.convertInputToTask).toHaveBeenCalledWith('saved-intake');
    expect(await screen.findByText('已记下“保留原文”。')).toBeInTheDocument();
  });
  it('keeps candidates after a conflict and completes only the selected one', async () => {
    const api = makeApi();
    const candidate = {
      id: 'task-1',
      title: '整理方案',
      recordDate: '2026-10-29',
      contact: null,
      revision: 4,
    };
    vi.mocked(api.submitInput).mockResolvedValue({
      kind: 'selection_required',
      intakeId: 'intake-1',
      candidates: [
        candidate,
        { ...candidate, id: 'task-2', title: '整理方案第二版' },
      ],
    });
    vi.mocked(api.selectCandidate)
      .mockRejectedValueOnce(new Error('CONFLICT'))
      .mockResolvedValue({ title: '整理方案' } as LifecycleTask);
    render(<TodayPanelApp api={api} />);
    await userEvent.type(screen.getByRole('textbox'), '整理方案已完成');
    await userEvent.click(screen.getByRole('button', { name: '记录' }));
    await screen.findByRole('heading', { name: '是哪一项完成了？' });
    expect(api.selectCandidate).not.toHaveBeenCalled();
    const choice = screen.getByRole('button', { name: '整理方案 2026-10-29' });
    await waitFor(() => expect(choice).toHaveFocus());
    await userEvent.click(choice);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '事项可能已变更',
    );
    expect(choice).toBeInTheDocument();
    await userEvent.click(choice);
    expect(api.selectCandidate).toHaveBeenLastCalledWith({
      intakeId: 'intake-1',
      taskId: 'task-1',
      revision: 4,
    });
    expect(
      await screen.findByText('“整理方案”已完成，漂亮的一分！'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '是哪一项完成了？' }),
    ).not.toBeInTheDocument();
  });
  it('blocks duplicate shortcuts and hiding while a request is pending', async () => {
    const api = makeApi();
    let done!: (
      value: Awaited<ReturnType<QuickInputApi['submitInput']>>,
    ) => void;
    vi.mocked(api.submitInput).mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    render(<TodayPanelApp api={api} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '明天开会');
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.blur(window);
    expect(api.submitInput).toHaveBeenCalledTimes(1);
    expect(api.close).not.toHaveBeenCalled();
    await act(async () =>
      done({
        kind: 'task',
        intakeId: '1',
        task: { title: '明天开会' } as LifecycleTask,
      }),
    );
  });
  it('distinguishes a query failure from an empty day and retries', async () => {
    const api = makeApi();
    vi.mocked(api.listTasks).mockRejectedValueOnce(new Error('offline'));
    render(<TodayPanelApp api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('加载失败');
    expect(screen.queryByText(/今天还没有待办/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试加载' }));
    expect(await screen.findByText(/今天还没有待办/)).toBeInTheDocument();
  });
  it('shows an input and at most seven entries, refreshes from events and releases subscriptions', async () => {
    const tasks = Array.from(
      { length: 8 },
      (_, index) =>
        ({
          id: `${index}`,
          title: `任务 ${index}`,
          status: 'open',
          dueDate: '2026-10-29',
          dueTime: '18:00',
        }) as LifecycleTask,
    );
    const api = makeApi(tasks);
    const off = vi.fn();
    let listener!: () => void;
    vi.mocked(api.onDataChanged).mockImplementation((callback) => {
      listener = callback;
      return off;
    });
    const { unmount } = render(<TodayPanelApp api={api} />);
    await screen.findByText('还有 1 项');
    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(
      screen.getByRole('textbox', { name: '日程或完成指令' }),
    ).toBeInTheDocument();
    await act(async () => listener());
    expect(api.listTasks).toHaveBeenCalledTimes(2);
    unmount();
    expect(off).toHaveBeenCalledOnce();
  });
  it('keeps floating input visible after blur and opening full records, but allows Escape', async () => {
    const api = makeApi();
    render(<TodayPanelApp api={api} />);
    await screen.findByText(/今天还没有待办/);
    await userEvent.click(screen.getByRole('button', { name: '打开完整记录' }));
    expect(api.focusMain).toHaveBeenCalledOnce();
    expect(api.close).not.toHaveBeenCalled();
    fireEvent.blur(window);
    expect(api.close).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(api.close).toHaveBeenCalledOnce();
  });
});
