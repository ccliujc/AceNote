import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '@acenote/contracts';
import { TaskEditor } from '../src/renderer/task-editor';

const task: Task = {
  id: '11111111-1111-4111-8111-111111111111', rawText: '明天写周报', title: '写周报',
  recordedAt: '2026-10-25T14:30:00.000Z', recordDate: '2026-10-25', dueDate: '2026-10-26', dueTime: null,
  timeZone: 'Asia/Shanghai', contact: null, parseStatus: 'succeeded', parseError: null,
  createdAt: '2026-10-25T14:30:00.000Z', updatedAt: '2026-10-25T14:30:00.000Z', editedAt: null, revision: 1,
};

describe('TaskEditor', () => {
  it('saves valid edits with the current revision', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TaskEditor task={task} onClose={vi.fn()} onSave={onSave} />);
    const title = screen.getByDisplayValue('写周报');
    await userEvent.clear(title);
    await userEvent.type(title, '完成周报');
    await userEvent.type(screen.getByLabelText('具体时间'), '10:30');
    await userEvent.type(screen.getByPlaceholderText('未提及可留空'), '小李');
    await userEvent.click(screen.getByRole('button', { name: /保存修改/ }));
    expect(onSave).toHaveBeenCalledWith({ title: '完成周报', dueDate: '2026-10-26', dueTime: '10:30', contact: '小李' }, 1);
  });

  it('rejects a time without a date', async () => {
    const onSave = vi.fn();
    render(<TaskEditor task={task} onClose={vi.fn()} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('截止日期'));
    await userEvent.type(screen.getByLabelText('具体时间'), '10:30');
    await userEvent.click(screen.getByRole('button', { name: /保存修改/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请先选择截止日期');
    expect(onSave).not.toHaveBeenCalled();
  });
});
