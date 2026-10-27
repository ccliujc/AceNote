import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AceNoteApi, Task } from '@acenote/contracts';
import { CapturePage } from '../src/renderer/capture-page';

const base: Task = {
  id: '11111111-1111-4111-8111-111111111111', rawText: '明天写周报', title: '写周报',
  recordedAt: '2026-10-25T14:30:00.000Z', recordDate: '2026-10-25', dueDate: null, dueTime: null,
  timeZone: 'Asia/Shanghai', contact: null, parseStatus: 'succeeded', parseError: null,
  createdAt: '2026-10-25T14:30:00.000Z', updatedAt: '2026-10-25T14:30:00.000Z', editedAt: null, revision: 1,
};
const failed: Task = { ...base, id: '22222222-2222-4222-8222-222222222222', title: '联系小王', rawText: '明天联系小王', parseStatus: 'failed', parseError: 'NETWORK_ERROR' };

function makeApi(overrides: Partial<AceNoteApi> = {}): AceNoteApi {
  return {
    submitTask: vi.fn(), listTasks: vi.fn().mockResolvedValue([base, failed]),
    updateTask: vi.fn().mockResolvedValue(base), retryParse: vi.fn().mockResolvedValue(base),
    reparseTask: vi.fn().mockResolvedValue(base), ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('record management workflow', () => {
  it('edits fields, confirms reparse and retries failed parsing', async () => {
    const api = makeApi();
    render(<CapturePage api={api} />);
    await screen.findByRole('heading', { name: '写周报' });

    await userEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!);
    const title = await screen.findByDisplayValue('写周报');
    await userEvent.clear(title);
    await userEvent.type(title, '完成周报');
    await userEvent.click(screen.getByRole('button', { name: /保存修改/ }));
    expect(api.updateTask).toHaveBeenCalledWith(base.id, { title: '完成周报', dueDate: null, dueTime: null, contact: null }, 1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: '重新识别' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: /保留修改并识别/ }));
    expect(api.reparseTask).toHaveBeenCalledWith(base.id, 'preserve');

    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(api.retryParse).toHaveBeenCalledWith(failed.id);
  });

  it('shows an in-dialog error when saving fails', async () => {
    render(<CapturePage api={makeApi({ updateTask: vi.fn().mockRejectedValue(new Error('CONCURRENT_EDIT')) })} />);
    await screen.findByRole('heading', { name: '写周报' });
    await userEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!);
    await userEvent.click(await screen.findByRole('button', { name: /保存修改/ }));
    expect(await screen.findByText(/保存失败/)).toBeInTheDocument();
  });
});
