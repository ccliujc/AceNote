import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReminderCenter } from '../src/renderer/reminder-center';

const reminders = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    taskId: '22222222-2222-4222-8222-222222222222',
    title: '先提醒',
    dueDate: '2026-10-28',
    dueTime: null,
    scheduledAt: '2026-10-28T01:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    taskId: '44444444-4444-4444-8444-444444444444',
    title: '后提醒',
    dueDate: '2026-10-28',
    dueTime: '15:00',
    scheduledAt: '2026-10-28T07:00:00.000Z',
  },
];

describe('ReminderCenter', () => {
  it('renders reminders and dismisses only the selected item', async () => {
    const onDismiss = vi.fn();
    render(<ReminderCenter reminders={reminders} onDismiss={onDismiss} />);
    expect(screen.getByText('先提醒')).toBeInTheDocument();
    expect(screen.getByText('截止 2026-10-28 09:00')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: '关闭提醒 先提醒' }),
    );
    expect(onDismiss).toHaveBeenCalledWith(reminders[0]);
  });

  it('renders nothing without active reminders', () => {
    const { container } = render(
      <ReminderCenter reminders={[]} onDismiss={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a failed dismissal available for retry', async () => {
    const onDismiss = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    render(
      <ReminderCenter reminders={[reminders[0]!]} onDismiss={onDismiss} />,
    );
    const close = screen.getByRole('button', { name: '关闭提醒 先提醒' });
    await userEvent.click(close);
    expect(await screen.findByRole('alert')).toHaveTextContent('关闭失败');
    expect(close).toBeEnabled();
    expect(screen.getByText('先提醒')).toBeInTheDocument();
    await userEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
