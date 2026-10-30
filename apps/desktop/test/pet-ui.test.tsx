import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PetApi } from '@acenote/contracts';
import { PetApp } from '../src/renderer/pet/pet-app';

afterEach(() => vi.useRealTimers());
function setup() {
  let completed!: Parameters<PetApi['onTaskCompleted']>[0];
  let remind!: Parameters<PetApi['onReminderDue']>[0];
  const off = vi.fn();
  const api: PetApi = {
    onDataChanged: vi.fn(() => () => {}),
    onTaskCompleted: vi.fn((listener) => {
      completed = listener;
      return off;
    }),
    onReminderDue: vi.fn((listener) => {
      remind = listener;
      return off;
    }),
    openToday: vi.fn().mockResolvedValue(undefined),
    focusMain: vi.fn().mockResolvedValue(undefined),
    setInteractive: vi.fn(),
    startDrag: vi.fn(),
    dragTo: vi.fn(),
    endDrag: vi.fn(),
  };
  window.pet = api;
  const view = render(<PetApp />);
  return { api, completed, remind, off, ...view };
}
describe('Pet message interaction', () => {
  it('keeps a completion visible for 15 seconds independently of its animation', () => {
    vi.useFakeTimers();
    const { completed, api } = setup();
    act(() => completed({ taskId: '1', title: '写周报' }));
    fireEvent.mouseMove(screen.getByRole('status'), {
      clientX: 10,
      clientY: 10,
    });
    expect(api.setInteractive).toHaveBeenLastCalledWith(true);
    act(() => vi.advanceTimersByTime(14_999));
    expect(screen.getByRole('status')).toHaveTextContent('写周报');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.setInteractive).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('restarts the full 15 seconds even when the same completion arrives again', () => {
    vi.useFakeTimers();
    const { completed } = setup();
    act(() => completed({ taskId: '1', title: '写周报' }));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => completed({ taskId: '1', title: '写周报' }));
    act(() => vi.advanceTimersByTime(14_999));
    expect(screen.getByRole('status')).toHaveTextContent('写周报');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('releases the empty message area while keeping the character interactive', () => {
    const { api, container } = setup();
    const stage = container.querySelector('.pet-stage')!;
    fireEvent.mouseMove(stage, { clientX: 100, clientY: 180 });
    expect(api.setInteractive).toHaveBeenLastCalledWith(true);
    fireEvent.mouseMove(stage, { clientX: 100, clientY: 70 });
    expect(api.setInteractive).toHaveBeenLastCalledWith(false);
  });
  it('keeps a stationary pointer over the character interactive after the message expires', () => {
    vi.useFakeTimers();
    const { api, completed, container } = setup();
    act(() => completed({ taskId: '1', title: '写周报' }));
    fireEvent.mouseMove(container.querySelector('.pet-stage')!, {
      clientX: 100,
      clientY: 180,
    });
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.setInteractive).toHaveBeenLastCalledWith(true);
  });
  it('still opens schedule input after a tiny mouse movement during a click', () => {
    vi.useFakeTimers();
    const { api, container } = setup();
    const character = container.querySelector<HTMLElement>('.pet-character')!;
    character.setPointerCapture = vi.fn();
    fireEvent(
      character,
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        screenX: 100,
        screenY: 100,
      }),
    );
    fireEvent(
      character,
      new MouseEvent('pointermove', {
        bubbles: true,
        screenX: 102,
        screenY: 102,
      }),
    );
    fireEvent(character, new MouseEvent('pointerup', { bubbles: true }));
    fireEvent.click(character);
    act(() => vi.advanceTimersByTime(230));
    expect(api.openToday).toHaveBeenCalledOnce();
    expect(api.dragTo).not.toHaveBeenCalled();
  });
  it('plays the human player hit and celebration poses before returning to ready', () => {
    vi.useFakeTimers();
    const { completed, container } = setup();
    const character = container.querySelector('.pet-character')!;
    act(() => completed({ taskId: '1', title: '写周报' }));
    expect(character).toHaveClass('mood-hit');
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('ryoma-hit'),
    );
    act(() => vi.advanceTimersByTime(700));
    expect(character).toHaveClass('mood-ace');
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('ryoma-ace'),
    );
    act(() => vi.advanceTimersByTime(900));
    expect(character).toHaveClass('mood-idle');
  });
  it('closes a long message without dragging or opening another window', async () => {
    const { api, completed } = setup();
    act(() =>
      completed({
        taskId: '11111111-1111-4111-8111-111111111111',
        title: '很长的任务标题'.repeat(20),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('很长的任务标题');
    await userEvent.click(screen.getByRole('button', { name: '关闭桌宠消息' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.startDrag).not.toHaveBeenCalled();
    expect(api.openToday).not.toHaveBeenCalled();
  });
  it('cancels manual-dismiss deadlines before displaying a later message', () => {
    vi.useFakeTimers();
    const { completed } = setup();
    act(() => completed({ taskId: '1', title: '写周报' }));
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole('button', { name: '关闭桌宠消息' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => completed({ taskId: '2', title: '整理材料' }));
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('status')).toHaveTextContent('整理材料');
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('keeps the bubble interactive and releases timers and subscriptions on unmount', () => {
    vi.useFakeTimers();
    const { api, completed, off, unmount } = setup();
    act(() =>
      completed({
        taskId: '11111111-1111-4111-8111-111111111111',
        title: '写周报',
      }),
    );
    fireEvent.mouseMove(screen.getByRole('button', { name: '关闭桌宠消息' }), {
      clientX: 10,
      clientY: 10,
    });
    expect(api.setInteractive).toHaveBeenLastCalledWith(true);
    unmount();
    expect(off).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('opens only floating input on clicks and double clicks and returns to idle after a reminder', () => {
    vi.useFakeTimers();
    const { api, remind, container } = setup();
    const character = container.querySelector('.pet-character')!;
    fireEvent.click(character);
    act(() => vi.advanceTimersByTime(230));
    expect(api.openToday).toHaveBeenCalledOnce();
    fireEvent.click(character, { detail: 2 });
    fireEvent.doubleClick(character);
    act(() => vi.advanceTimersByTime(230));
    expect(api.openToday).toHaveBeenCalledOnce();
    expect(api.focusMain).not.toHaveBeenCalled();
    act(() =>
      remind({
        reminder: {
          id: '1',
          taskId: '2',
          title: '提醒事项',
          dueDate: '2026-10-29',
          dueTime: null,
          scheduledAt: '2026-10-29T01:00:00Z',
        },
      }),
    );
    expect(character).toHaveClass('mood-reminder');
    act(() => vi.advanceTimersByTime(950));
    expect(character).toHaveClass('mood-idle');
    fireEvent.mouseLeave(container.querySelector('.pet-stage')!);
    expect(api.setInteractive).toHaveBeenLastCalledWith(false);
  });
  it('saves a drag and suppresses the click at its end', () => {
    vi.useFakeTimers();
    const { api, container } = setup();
    const character = container.querySelector<HTMLElement>('.pet-character')!;
    character.setPointerCapture = vi.fn();
    fireEvent(
      character,
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        screenX: 100,
        screenY: 100,
      }),
    );
    fireEvent(
      character,
      new MouseEvent('pointermove', {
        bubbles: true,
        screenX: 120,
        screenY: 130,
      }),
    );
    fireEvent(character, new MouseEvent('pointerup', { bubbles: true }));
    fireEvent.click(character);
    act(() => vi.advanceTimersByTime(230));
    expect(api.startDrag).toHaveBeenCalledWith(100, 100);
    expect(api.dragTo).toHaveBeenCalledWith(120, 130);
    expect(api.endDrag).toHaveBeenCalledOnce();
    expect(api.openToday).not.toHaveBeenCalled();
  });
});
