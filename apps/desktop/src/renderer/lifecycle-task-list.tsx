import type { LifecycleTask, TaskStatusFilter } from '@acenote/contracts';

interface LifecycleTaskListProps {
  tasks: LifecycleTask[];
  loading: boolean;
  busyId: string | null;
  selectedId?: string;
  filter?: TaskStatusFilter;
  onShowAll?: () => void;
  today: string;
  nowTime: string;
  onArchive: (task: LifecycleTask) => void;
  onRestore: (task: LifecycleTask) => void;
  onEdit: (task: LifecycleTask) => void;
}

function overdue(task: LifecycleTask, today: string, nowTime: string): boolean {
  if (task.status !== 'open' || !task.dueDate) return false;
  if (task.dueDate < today) return true;
  return (
    task.dueDate === today && Boolean(task.dueTime && task.dueTime < nowTime)
  );
}

const labels = {
  open: '未完成',
  completed: '已完成',
  archived: '已归档',
} as const;

export function LifecycleTaskList({
  tasks,
  loading,
  busyId,
  selectedId,
  filter = 'all',
  onShowAll,
  today,
  nowTime,
  onArchive,
  onRestore,
  onEdit,
}: LifecycleTaskListProps) {
  if (loading)
    return (
      <div className="empty-state" role="status">
        <span className="tennis-ball" />
        <p>正在取出这一天的记录…</p>
      </div>
    );
  if (tasks.length === 0 && filter !== 'all')
    return (
      <div className="empty-state">
        <span className="tennis-ball" />
        <h3>没有{labels[filter]}的记录</h3>
        <p>可以换个状态，或查看这一天的全部记录。</p>
        <button className="secondary-button" onClick={onShowAll}>
          查看全部
        </button>
      </div>
    );
  if (tasks.length === 0)
    return (
      <div className="empty-state">
        <span className="tennis-ball" />
        <h3>这一天，球场还空着</h3>
        <p>写下第一件事，让它成为你的下一分。</p>
      </div>
    );
  return (
    <div className="task-list">
      {tasks.map((task, index) => (
        <article
          className={`task-card lifecycle-${task.status} ${selectedId === task.id ? 'task-selected' : ''}`}
          key={task.id}
          aria-label={task.title}
        >
          <div className="task-number">
            {String(index + 1).padStart(2, '0')}
          </div>
          <div className="task-body">
            <div className="task-title-row">
              <h3>{task.title}</h3>
              <span className={`status-pill ${task.status}`}>
                <i />
                {labels[task.status]}
              </span>
            </div>
            <div className="task-meta">
              <span>记录 {task.recordDate}</span>
              {task.dueDate && (
                <span>
                  截止 {task.dueDate}
                  {task.dueTime ? ` ${task.dueTime}` : ''}
                </span>
              )}
              {task.contact && <span>对接 {task.contact}</span>}
              {task.completionDate && <span>完成 {task.completionDate}</span>}
              {overdue(task, today, nowTime) && (
                <span className="overdue-mark">已逾期</span>
              )}
            </div>
            {task.parseError && (
              <p className="parse-error">
                原文已保存。
                {task.parseError === 'PARSE_NOT_CONFIGURED'
                  ? '配置 DeepSeek 后即可识别。'
                  : '可重新识别或手动编辑。'}
              </p>
            )}
          </div>
          <div className="task-actions">
            <button
              className="text-button"
              disabled={busyId === task.id}
              onClick={() => onEdit(task)}
            >
              编辑
            </button>
            {task.status === 'open' && (
              <button
                className="text-button"
                disabled={Boolean(busyId)}
                onClick={() => onArchive(task)}
              >
                {busyId === task.id ? '归档中…' : '归档'}
              </button>
            )}
            {task.status !== 'open' && (
              <button
                className="text-button"
                disabled={Boolean(busyId)}
                onClick={() => onRestore(task)}
              >
                {busyId === task.id ? '恢复中…' : '恢复'}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
