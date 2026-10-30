import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LifecycleTask } from '@acenote/contracts';
import { courtLayout, MAX_COURT_BALLS } from '../src/renderer/court-layout';
import { CourtView } from '../src/renderer/court-view';

const task = (
  id: string,
  status: LifecycleTask['status'] = 'open',
): LifecycleTask => ({
  id,
  rawText: `任务${id}`,
  title: `任务${id}`,
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
  revision: 0,
  status,
  completedAt: null,
  completionDate: null,
  completionTimeZone: null,
  archivedAt: null,
});

describe('court view', () => {
  it('lays out up to 24 stable non-overlapping positions', () => {
    expect(courtLayout(0)).toEqual([]);
    const positions = courtLayout(25);
    expect(positions).toHaveLength(MAX_COURT_BALLS);
    expect(
      new Set(positions.map((point) => `${point.x},${point.y}`)).size,
    ).toBe(positions.length);
    expect(positions[0]).toEqual({ x: 8, y: 16 });
  });

  it('renders status classes and selects a task ball', async () => {
    const onSelect = vi.fn();
    const tasks = [task('1'), task('2', 'completed'), task('3', 'archived')];
    render(<CourtView tasks={tasks} selectedId="1" onSelect={onSelect} />);
    expect(screen.getByLabelText('任务1，未完成')).toHaveClass(
      'open',
      'selected',
    );
    expect(screen.getByLabelText('任务2，已完成')).toHaveClass('completed');
    expect(screen.getByLabelText('任务3，已归档')).toHaveClass('archived');
    await userEvent.click(screen.getByLabelText('任务2，已完成'));
    expect(onSelect).toHaveBeenCalledWith(tasks[1]);
  });

  it('limits visible balls and reports the remainder', () => {
    const tasks = Array.from({ length: 25 }, (_, index) => task(String(index)));
    render(<CourtView tasks={tasks} selectedId={null} onSelect={vi.fn()} />);
    expect(
      screen.getByText('还有 1 项，请在任务列表查看。'),
    ).toBeInTheDocument();
  });
});
