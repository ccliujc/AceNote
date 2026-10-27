import type { Task } from '@acenote/contracts';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  onRetry: (id: string) => Promise<void>;
  onEdit: (task: Task) => void;
  onReparse: (task: Task) => void;
}

const statusLabels: Record<Task['parseStatus'], string> = {
  pending: '等待识别',
  processing: '正在识别',
  succeeded: '已识别',
  failed: '识别失败',
};

export function TaskList({ tasks, loading, onRetry, onEdit, onReparse }: TaskListProps) {
  if (loading) return <div className="empty-state"><span className="tennis-ball" /><p>正在取出你的记录…</p></div>;
  if (tasks.length === 0) {
    return <div className="empty-state"><span className="tennis-ball" /><h3>球场还空着</h3><p>写下第一件事，让它成为你的下一分。</p></div>;
  }

  return (
    <div className="task-list">
      {tasks.map((task, index) => (
        <article className="task-card" key={task.id}>
          <div className="task-number">{String(index + 1).padStart(2, '0')}</div>
          <div className="task-body">
            <div className="task-title-row">
              <h3>{task.title}</h3>
              <span className={`status-pill ${task.parseStatus}`}><i />{statusLabels[task.parseStatus]}</span>
            </div>
            {task.rawText !== task.title && <p className="raw-text">“{task.rawText}”</p>}
            <div className="task-meta">
              <span>记录 {task.recordDate}</span>
              {task.dueDate && <span>截止 {task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ''}</span>}
              {task.contact && <span>对接 {task.contact}</span>}
            </div>
            {task.parseError && <p className="parse-error">原文已保存。{task.parseError === 'PARSE_NOT_CONFIGURED' ? '配置 DeepSeek 后即可识别。' : '可检查网络后重试。'}</p>}
          </div>
          <div className="task-actions">
            <button className="text-button" onClick={() => onEdit(task)}>编辑</button>
            {(task.parseStatus === 'failed' || task.parseStatus === 'pending') && (
              <button className="text-button" onClick={() => void onRetry(task.id)}>重试</button>
            )}
            {task.parseStatus === 'succeeded' && (
              <button className="text-button" onClick={() => onReparse(task)}>重新识别</button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
