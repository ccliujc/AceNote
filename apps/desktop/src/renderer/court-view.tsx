import { useEffect, useState } from 'react';
import type { LifecycleTask } from '@acenote/contracts';
import { courtLayout, MAX_COURT_BALLS } from './court-layout';

interface CourtViewProps {
  tasks: LifecycleTask[];
  selectedId: string | null;
  onSelect: (task: LifecycleTask) => void;
}

export function CourtView({ tasks, selectedId, onSelect }: CourtViewProps) {
  const [compact, setCompact] = useState(
    () =>
      typeof matchMedia === 'function' &&
      matchMedia('(max-width: 1039px), (max-height: 699px)').matches,
  );
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(max-width: 1039px), (max-height: 699px)');
    const change = () => {
      setCompact(media.matches);
      setExpanded(false);
    };
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const visible = tasks.slice(0, MAX_COURT_BALLS);
  const positions = courtLayout(visible.length);
  const remaining = tasks.length - visible.length;
  return (
    <section className="court-panel" aria-label="每日网球场">
      {compact ? (
        <button
          className="court-toggle"
          aria-expanded={expanded}
          aria-controls="daily-court-content"
          onClick={() => setExpanded(!expanded)}
        >
          <span>
            球场概览 <span className="court-count">· {tasks.length} 项</span>
          </span>
          <span>{expanded ? '收起 −' : '展开 ＋'}</span>
        </button>
      ) : (
        <div className="court-labels">
          <span>每日球场</span>
          <span>
            {tasks.length > 0 ? `${tasks.length} 球在场` : '等待开球'}
          </span>
        </div>
      )}
      <div id="daily-court-content" hidden={compact && !expanded}>
        <div
          className="court-field"
          style={visible.length > 6 ? { height: 184 } : undefined}
        >
          <div className="court-net" />
          <div className="court-service-line" />
          {visible.map((task, index) => {
            const position = positions[index]!;
            return (
              <button
                key={task.id}
                className={`court-ball ${task.status} ${selectedId === task.id ? 'selected' : ''}`}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                aria-label={`${task.title}，${task.status === 'open' ? '未完成' : task.status === 'completed' ? '已完成' : '已归档'}`}
                aria-pressed={selectedId === task.id}
                onClick={() => onSelect(task)}
              >
                <span />
              </button>
            );
          })}
          {tasks.length === 0 && (
            <p className="court-empty">球场还空着，写下第一件事。</p>
          )}
        </div>
        <div className="court-legend">
          <span>
            <i className="legend-ball" />
            未完成
          </span>
          <span>
            <i className="legend-ball completed" />
            已完成
          </span>
          <span>
            <i className="legend-ball archived" />
            已归档
          </span>
        </div>
        {remaining > 0 && (
          <p className="court-more">还有 {remaining} 项，请在任务列表查看。</p>
        )}
      </div>
    </section>
  );
}
