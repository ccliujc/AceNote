import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '@acenote/contracts';
import { ReparseDialog } from '../src/renderer/reparse-dialog';

const task = { id: '1', rawText: '原始文字' } as Task;

describe('ReparseDialog', () => {
  it('offers preserve as the primary choice', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReparseDialog task={task} onClose={vi.fn()} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /保留修改并识别/ }));
    expect(onConfirm).toHaveBeenCalledWith('preserve');
  });

  it('requires explicit intent before replacing fields', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReparseDialog task={task} onClose={vi.fn()} onConfirm={onConfirm} />);
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '覆盖并重新识别' }));
    expect(onConfirm).toHaveBeenCalledWith('replace');
  });
});
