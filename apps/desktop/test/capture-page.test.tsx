import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AceNoteApi, Task } from '@acenote/contracts';
import { CapturePage } from '../src/renderer/capture-page';

const task: Task = {
  id: '11111111-1111-4111-8111-111111111111', rawText: '明天写周报', title: '写周报',
  recordedAt: '2026-10-25T14:30:00.000Z', recordDate: '2026-10-25', dueDate: '2026-10-26',
  dueTime: null, timeZone: 'Asia/Shanghai', contact: null, parseStatus: 'succeeded', parseError: null,
  createdAt: '2026-10-25T14:30:00.000Z', updatedAt: '2026-10-25T14:30:00.000Z', editedAt: null, revision: 1,
};

function makeApi(overrides: Partial<AceNoteApi> = {}): AceNoteApi {
  return {
    submitTask: vi.fn().mockResolvedValue({ ...task, parseStatus: 'pending', revision: 0 }),
    listTasks: vi.fn().mockResolvedValue([]), updateTask: vi.fn(), retryParse: vi.fn().mockResolvedValue(task),
    reparseTask: vi.fn(), ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('CapturePage', () => {
  it('rejects empty submissions without calling the API', async () => {
    const api = makeApi();
    render(<CapturePage api={api} />);
    await userEvent.click(screen.getByRole('button', { name: /记下这一球/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('先写下一句话');
    expect(api.submitTask).not.toHaveBeenCalled();
  });

  it('submits raw text, clears the editor and shows the new task', async () => {
    const api = makeApi();
    render(<CapturePage api={api} />);
    await userEvent.type(screen.getByLabelText('待办内容'), '明天写周报');
    await userEvent.click(screen.getByRole('button', { name: /记下这一球/ }));
    expect(api.submitTask).toHaveBeenCalledWith('明天写周报');
    expect(await screen.findByRole('heading', { name: '写周报' })).toBeInTheDocument();
    expect(screen.getByLabelText('待办内容')).toHaveValue('');
  });

  it('shows saved tasks and loading failures', async () => {
    const api = makeApi({ listTasks: vi.fn().mockResolvedValue([task]) });
    const { unmount } = render(<CapturePage api={api} />);
    expect(await screen.findByText(/2026-10-26/)).toBeInTheDocument();
    unmount();

    render(<CapturePage api={makeApi({ listTasks: vi.fn().mockRejectedValue(new Error('NETWORK_ERROR')) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('解析服务暂时不可用');
  });
});
