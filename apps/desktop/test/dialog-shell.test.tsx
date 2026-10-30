import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DialogShell } from '../src/renderer/dialog-shell';

function Example({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>打开编辑</button>
      <button>背景操作</button>
      {open && (
        <DialogShell
          labelledBy="dialog-title"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <h2 id="dialog-title">测试弹窗</h2>
          <input data-autofocus aria-label="标题" />
          <button>最后一个操作</button>
        </DialogShell>
      )}
    </>
  );
}
describe('DialogShell keyboard behavior', () => {
  it('focuses the field, traps Tab both ways, and restores the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: '打开编辑' });
    await user.click(trigger);
    expect(screen.getByLabelText('标题')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '最后一个操作' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('标题')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('标题'), {
      key: 'Escape',
      isComposing: true,
      keyCode: 229,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
  it('prevents Escape and backdrop dismissal during a pending request', async () => {
    const user = userEvent.setup();
    render(<Example busy />);
    await user.click(screen.getByRole('button', { name: '打开编辑' }));
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
