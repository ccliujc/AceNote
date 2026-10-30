import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  EditorApi,
  LifecycleApi,
  LifecycleTask,
} from '@acenote/contracts';
import { LifecyclePage } from '../src/renderer/lifecycle-page';

const task: LifecycleTask = {
  id: '11111111-1111-4111-8111-111111111111',
  rawText: '写周报',
  title: '写周报',
  recordedAt: '2026-10-28T01:00:00.000Z',
  recordDate: '2026-10-28',
  dueDate: null,
  dueTime: null,
  timeZone: 'Asia/Shanghai',
  contact: null,
  parseStatus: 'succeeded',
  parseError: null,
  createdAt: '2026-10-28T01:00:00.000Z',
  updatedAt: '2026-10-28T01:00:00.000Z',
  editedAt: null,
  revision: 1,
  status: 'open',
  completedAt: null,
  completionDate: null,
  completionTimeZone: null,
  archivedAt: null,
};

function api(overrides: Partial<LifecycleApi> = {}): LifecycleApi {
  return {
    submitInput: vi
      .fn()
      .mockResolvedValue({ kind: 'task', intakeId: task.id, task }),
    retryInput: vi.fn(),
    convertInputToTask: vi.fn().mockResolvedValue(task),
    listTasks: vi.fn().mockResolvedValue([task]),
    getDailySummary: vi
      .fn()
      .mockResolvedValue({ date: task.recordDate, completedCount: 3 }),
    selectCandidate: vi
      .fn()
      .mockResolvedValue({ ...task, status: 'completed' }),
    archiveTask: vi.fn().mockResolvedValue({ ...task, status: 'archived' }),
    restoreTask: vi.fn().mockResolvedValue(task),
    ...overrides,
  };
}
const editorApi = { updateTask: vi.fn() } as unknown as EditorApi;
const reminderApi = {
  onReminderDue: vi.fn(() => () => {}),
  dismissReminder: vi.fn().mockResolvedValue(undefined),
};
const experienceApi = {
  onDataChanged: vi.fn(() => () => {}),
  onTaskCompleted: vi.fn(() => () => {}),
};

beforeEach(() => vi.clearAllMocks());

describe('LifecyclePage', () => {
  it('shows daily records and completion count', async () => {
    render(
      <LifecyclePage
        api={api()}
        editorApi={editorApi}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: '写周报' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('未完成').length).toBeGreaterThan(0);
  });

  it('filters by status and archives with revision', async () => {
    const lifecycle = api();
    render(
      <LifecyclePage
        api={lifecycle}
        editorApi={editorApi}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
      />,
    );
    await screen.findByRole('heading', { name: '写周报' });
    await userEvent.click(screen.getByRole('button', { name: '未完成' }));
    expect(lifecycle.listTasks).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: '未完成', pressed: true }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '归档' }));
    expect(lifecycle.archiveTask).toHaveBeenCalledWith(task.id, 1);
  });

  it('asks for a choice before completing an ambiguous target', async () => {
    const candidates = [
      {
        id: task.id,
        title: '写周报',
        recordDate: '2026-10-28',
        contact: null,
        revision: 1,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: '写周报',
        recordDate: '2026-10-27',
        contact: null,
        revision: 1,
      },
    ];
    const lifecycle = api({
      submitInput: vi.fn().mockResolvedValue({
        kind: 'selection_required',
        intakeId: task.id,
        candidates,
      }),
    });
    render(
      <LifecyclePage
        api={lifecycle}
        editorApi={editorApi}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
      />,
    );
    await screen.findByRole('heading', { name: '写周报' });
    await userEvent.type(screen.getByLabelText('待办或完成指令'), '写周报完成');
    await userEvent.click(screen.getByRole('button', { name: /^记录$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('是哪一项完成了');
    await userEvent.click(
      within(dialog).getAllByRole('button', { name: /写周报/ })[0]!,
    );
    expect(lifecycle.selectCandidate).toHaveBeenCalledWith({
      intakeId: task.id,
      taskId: task.id,
      revision: 1,
    });
  });

  it('offers retry and conversion when no match is found', async () => {
    const lifecycle = api({
      submitInput: vi.fn().mockResolvedValue({
        kind: 'no_match',
        intakeId: task.id,
        message: '没有找到对应事项',
      }),
    });
    render(
      <LifecyclePage
        api={lifecycle}
        editorApi={editorApi}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
      />,
    );
    await screen.findByRole('heading', { name: '写周报' });
    await userEvent.type(screen.getByLabelText('待办或完成指令'), '不存在完成');
    await userEvent.click(screen.getByRole('button', { name: /^记录$/ }));
    expect(await screen.findByText('没有找到对应事项')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '作为新待办' }));
    expect(lifecycle.convertInputToTask).toHaveBeenCalledWith(task.id);
  });

  it('filters completed records and restores non-open tasks', async () => {
    const completed = {
      ...task,
      id: '22222222-2222-4222-8222-222222222222',
      title: '完成项',
      status: 'completed' as const,
      revision: 2,
    };
    const archived = {
      ...task,
      id: '33333333-3333-4333-8333-333333333333',
      title: '归档项',
      status: 'archived' as const,
      revision: 3,
    };
    const lifecycle = api({
      listTasks: vi.fn().mockResolvedValue([completed, archived]),
      restoreTask: vi.fn().mockResolvedValue(archived),
    });
    render(
      <LifecyclePage
        api={lifecycle}
        editorApi={editorApi}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
      />,
    );
    expect(await screen.findByText('归档项')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '已完成' }));
    expect(lifecycle.listTasks).toHaveBeenCalledWith(expect.any(String), 'all');
    expect(
      screen.queryByRole('heading', { name: '归档项' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: '恢复' })[0]!);
    expect(lifecycle.restoreTask).toHaveBeenCalled();
  });

  it('clears the draft and reports a created task', async () => {
    render(
      <LifecyclePage
        api={api()}
        editorApi={editorApi}
        reminderApi={reminderApi}
        experienceApi={experienceApi}
      />,
    );
    await screen.findByRole('heading', { name: '写周报' });
    await userEvent.type(screen.getByLabelText('待办或完成指令'), '新任务');
    await userEvent.click(screen.getByRole('button', { name: /^记录$/ }));
    expect(await screen.findByText('新的一球，已经记下。')).toBeInTheDocument();
    expect(screen.getByLabelText('待办或完成指令')).toHaveValue('');
  });
});
