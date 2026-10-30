import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  EditorApi,
  LifecycleApi,
  LifecycleTask,
} from '@acenote/contracts';
import { LifecyclePage } from '../src/renderer/lifecycle-page';

const task: LifecycleTask = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '写周报',
  rawText: '写周报',
  recordedAt: '2026-10-29T01:00:00Z',
  recordDate: '2026-10-29',
  dueDate: null,
  dueTime: null,
  timeZone: 'Asia/Shanghai',
  contact: null,
  parseStatus: 'succeeded',
  parseError: null,
  createdAt: '2026-10-29T01:00:00Z',
  updatedAt: '2026-10-29T01:00:00Z',
  editedAt: null,
  revision: 1,
  status: 'open',
  completedAt: null,
  completionDate: null,
  completionTimeZone: null,
  archivedAt: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(overrides: Partial<LifecycleApi> = {}) {
  const api: LifecycleApi = {
    listTasks: vi.fn().mockResolvedValue([task]),
    getDailySummary: vi
      .fn()
      .mockResolvedValue({ date: task.recordDate, completedCount: 3 }),
    submitInput: vi
      .fn()
      .mockResolvedValue({ kind: 'task', intakeId: task.id, task }),
    retryInput: vi.fn(),
    convertInputToTask: vi.fn().mockResolvedValue(task),
    completeTask: vi.fn(),
    selectCandidate: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
    ...overrides,
  };
  render(
    <LifecyclePage
      api={api}
      editorApi={{ updateTask: vi.fn() } as unknown as EditorApi}
      reminderApi={{ onReminderDue: () => () => {}, dismissReminder: vi.fn() }}
      experienceApi={{
        onDataChanged: () => () => {},
        onTaskCompleted: () => () => {},
      }}
    />,
  );
  return api;
}

describe('UI polish behavior', () => {
  it('filters a daily snapshot without refetching or changing completion statistics', async () => {
    const api = setup();
    await screen.findByRole('heading', { name: task.title });
    await userEvent.click(screen.getByRole('button', { name: '已完成' }));
    expect(
      screen.queryByRole('heading', { name: task.title }),
    ).not.toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledTimes(1);
    expect(screen.getByText('没有已完成的记录')).toBeInTheDocument();
    expect(screen.getByLabelText('当日完成')).toHaveTextContent('3');
    await userEvent.click(screen.getByRole('button', { name: '查看全部' }));
    expect(
      screen.getByRole('heading', { name: task.title }),
    ).toBeInTheDocument();
  });

  it('rejects an older response after switching dates', async () => {
    const oldRequest = deferred<LifecycleTask[]>();
    const api = setup({
      listTasks: vi
        .fn()
        .mockReturnValueOnce(oldRequest.promise)
        .mockResolvedValue([{ ...task, title: '新日期的任务' }]),
    });
    fireEvent.change(screen.getByLabelText('记录日期'), {
      target: { value: '2026-10-20' },
    });
    await screen.findByRole('heading', { name: '新日期的任务' });
    await act(async () => oldRequest.resolve([task]));
    expect(
      screen.queryByRole('heading', { name: task.title }),
    ).not.toBeInTheDocument();
    expect(api.listTasks).toHaveBeenLastCalledWith('2026-10-20', 'all');
  });

  it('shows a query failure instead of a misleading empty state and can retry', async () => {
    setup({
      listTasks: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue([task]),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.queryByText('这一天，球场还空着')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(
      await screen.findByRole('heading', { name: task.title }),
    ).toBeInTheDocument();
  });

  it('prevents overlapping shortcut submissions', async () => {
    const pending = deferred<never>();
    const api = setup({
      submitInput: vi.fn().mockReturnValue(pending.promise),
    });
    const input = screen.getByLabelText('待办或完成指令');
    await userEvent.type(input, '明天整理资料');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(api.submitInput).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(api.submitInput).toHaveBeenCalledTimes(1));
  });

  it('does not submit an IME composition', async () => {
    const api = setup();
    await screen.findByRole('heading', { name: task.title });
    const input = screen.getByLabelText('待办或完成指令');
    fireEvent.change(input, { target: { value: '中文输入中' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, {
      key: 'Enter',
      ctrlKey: true,
      isComposing: true,
      keyCode: 229,
    });
    expect(api.submitInput).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
  });

  it('keeps the draft when submission fails', async () => {
    setup({ submitInput: vi.fn().mockRejectedValue(new Error('offline')) });
    await userEvent.type(
      screen.getByLabelText('待办或完成指令'),
      '不能丢失的输入',
    );
    await userEvent.click(screen.getByRole('button', { name: '记录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('操作未完成');
    expect(screen.getByLabelText('待办或完成指令')).toHaveValue(
      '不能丢失的输入',
    );
  });

  it('reports retry failures while preserving the intake and draft', async () => {
    const api = setup({
      submitInput: vi.fn().mockResolvedValue({
        kind: 'failed',
        intakeId: task.id,
        error: 'NETWORK_ERROR',
        message: '识别失败',
      }),
      retryInput: vi.fn().mockRejectedValue(new Error('offline')),
    });
    await userEvent.type(screen.getByLabelText('待办或完成指令'), '保留这句话');
    await userEvent.click(screen.getByRole('button', { name: /^(发球|记录)/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: '重试识别' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('操作未完成');
    expect(screen.getByLabelText('待办或完成指令')).toHaveValue('保留这句话');
    expect(api.retryInput).toHaveBeenCalledWith(task.id);
  });
  it('keeps ambiguous candidates and draft visible after a stale selection fails', async () => {
    const candidate = {
      id: task.id,
      title: task.title,
      recordDate: task.recordDate,
      revision: 1,
      contact: null,
    };
    const api = setup({
      submitInput: vi.fn().mockResolvedValue({
        kind: 'selection_required',
        intakeId: task.id,
        candidates: [candidate, { ...candidate, id: '2', title: '另一个周报' }],
      }),
      selectCandidate: vi.fn().mockRejectedValue(new Error('CONFLICT')),
    });
    await userEvent.type(screen.getByLabelText('待办或完成指令'), '周报完成');
    await userEvent.click(screen.getByRole('button', { name: '记录' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /写周报 2026/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '事项可能已变更',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('待办或完成指令')).toHaveValue('周报完成');
    expect(api.selectCandidate).toHaveBeenCalledWith({
      intakeId: task.id,
      taskId: task.id,
      revision: 1,
    });
  });
});
