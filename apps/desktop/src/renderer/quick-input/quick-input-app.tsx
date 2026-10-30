import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  CompletionCandidate,
  DailyCompletionSummary,
  InputOutcome,
  LifecycleTask,
  QuickInputApi,
} from '@acenote/contracts';
import { todayLocal } from '../date-navigator';
import { CaptureComposer } from '../capture-composer';
import { isTaskTimePast } from '../task-time';
import './quick-input.css';

declare global {
  interface Window {
    today: QuickInputApi;
  }
}
const labels = {
  open: '未完成',
  completed: '已完成',
  archived: '已归档',
} as const;
type InputAction = Extract<InputOutcome, { kind: 'failed' | 'no_match' }>;
type Selection = { intakeId: string; candidates: CompletionCandidate[] };
const focusInput = () => document.getElementById('capture-draft')?.focus();
const displayDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00`));
const dueLabel = (task: LifecycleTask, today: string) => {
  if (!task.dueDate) return '';
  const day =
    task.dueDate === today
      ? task.dueTime
        ? ''
        : '今天'
      : `${Number(task.dueDate.slice(5, 7))}月${Number(task.dueDate.slice(8, 10))}日`;
  return [day, task.dueTime].filter(Boolean).join(' ');
};

export function TodayPanelApp({ api = window.today }: { api?: QuickInputApi }) {
  const date = todayLocal();
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<{
    tasks: LifecycleTask[];
    summary: DailyCompletionSummary;
  } | null>(null);
  const [queryError, setQueryError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const working = busy || completingId !== null;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<InputAction | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const inputLock = useRef(false);
  const request = useRef(0);
  const currentSelection = useRef(selection);
  const candidates = useRef<HTMLElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    currentSelection.current = selection;
  });
  useEffect(() => {
    if (selection && !working)
      candidates.current?.querySelector('button')?.focus();
  }, [selection, working]);

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setRefreshing(true);
    setQueryError('');
    try {
      const [tasks, summary] = await Promise.all([
        api.listTasks(date),
        api.getSummary(date),
      ]);
      if (sequence === request.current) setData({ tasks, summary });
    } catch {
      if (sequence === request.current)
        setQueryError('今日待办加载失败，请重试。');
    } finally {
      if (sequence === request.current) setRefreshing(false);
    }
  }, [api, date]);
  useEffect(() => {
    void refresh();
    const off = api.onDataChanged(() => void refresh());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.isComposing ||
        event.keyCode === 229 ||
        inputLock.current
      )
        return;
      event.preventDefault();
      if (currentSelection.current) {
        setSelection(null);
        setError('');
        focusInput();
      } else api.close();
    };
    const focusCurrent = () => {
      if (currentSelection.current)
        candidates.current?.querySelector('button')?.focus();
      else focusInput();
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('focus', focusCurrent);
    return () => {
      request.current += 1;
      off();
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('focus', focusCurrent);
    };
  }, [api, refresh]);

  async function handleOutcome(outcome: InputOutcome) {
    if (outcome.kind === 'selection_required') {
      setAction(null);
      setSelection(outcome);
      return;
    }
    if (outcome.kind === 'failed' || outcome.kind === 'no_match') {
      setAction(outcome);
      return;
    }
    setDraft('');
    setAction(null);
    setSelection(null);
    const task = outcome.task;
    const time =
      task.dueDate && task.dueTime
        ? `${task.dueDate === todayLocal() ? '今天' : task.dueDate} ${task.dueTime}`
        : '';
    setNotice(
      outcome.kind === 'task'
        ? time
          ? `已记下“${task.title}”，时间为${time}${isTaskTimePast(task) ? '（已过时间，不会补发提醒）' : ''}。`
          : `已记下“${task.title}”。`
        : `“${task.title}”已完成，漂亮的一分！`,
    );
    await refresh();
    focusInput();
  }
  async function perform(
    operation: () => Promise<void>,
    failure = '操作未完成，输入已保留，请重试。',
  ) {
    if (inputLock.current) return;
    inputLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch {
      setError(failure);
    } finally {
      inputLock.current = false;
      setBusy(false);
    }
  }
  function submit() {
    const rawText = draft.trim();
    if (!rawText || selection || inputLock.current) return;
    setAction(null);
    void perform(async () => handleOutcome(await api.submitInput(rawText)));
  }
  function select(candidate: CompletionCandidate) {
    if (!selection) return;
    void perform(async () => {
      const task = await api.selectCandidate({
        intakeId: selection.intakeId,
        taskId: candidate.id,
        revision: candidate.revision,
      });
      await handleOutcome({
        kind: 'completed',
        intakeId: selection.intakeId,
        task,
      });
    }, '确认失败，事项可能已变更。请重试或重新描述。');
  }
  async function complete(task: LifecycleTask) {
    if (task.status !== 'open' || inputLock.current) return;
    inputLock.current = true;
    setCompletingId(task.id);
    setError('');
    setNotice('');
    try {
      const completed = await api.completeTask(task.id, task.revision);
      setNotice(`“${completed.title}”已完成，漂亮的一分！`);
      await refresh();
      focusInput();
    } catch {
      setError('完成失败，事项可能已变更，请重试。');
      await refresh();
    } finally {
      inputLock.current = false;
      setCompletingId(null);
    }
  }
  return (
    <main className="today-card">
      <header className="today-header">
        <h1>我的一天</h1>
        <time dateTime={date}>{displayDate(date)}</time>
        <button
          aria-label="收起日程浮窗"
          disabled={working}
          onClick={() => api.close()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2 2 8 8m0-8-8 8" />
          </svg>
        </button>
      </header>
      <CaptureComposer
        draft={draft}
        busy={busy}
        disabled={Boolean(selection) || completingId !== null}
        onChange={(value) => {
          setDraft(value);
          if (action) setAction(null);
          setError('');
        }}
        onSubmit={submit}
        variant="compact"
        heading="添加一件事"
        inputLabel="日程或完成指令"
        placeholder="添加一件事… 如下午2点开会"
        autoFocus
      />
      <div className="today-summary">
        <h2>
          今天 <span>{data?.tasks.length ?? '—'}</span>
        </h2>
        <span>
          {data
            ? `已完成 ${data.summary.completedCount}`
            : queryError
              ? '暂不可用'
              : '正在加载'}
        </span>
      </div>
      <div
        className="today-list"
        aria-busy={refreshing || completingId !== null}
      >
        {notice && (
          <p className="quick-feedback quick-success" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="quick-feedback quick-error" role="alert">
            {error}
          </p>
        )}
        {action && (
          <section
            className="quick-feedback quick-action"
            aria-label="输入处理结果"
          >
            <p>
              {action.kind === 'failed'
                ? '这句话暂时未能识别，原文已保存。'
                : action.message}
            </p>
            <div>
              <button
                disabled={working}
                onClick={() =>
                  void perform(async () =>
                    handleOutcome(await api.retryInput(action.intakeId)),
                  )
                }
              >
                重试识别
              </button>
              <button
                disabled={working}
                onClick={() =>
                  void perform(async () => {
                    const task = await api.convertInputToTask(action.intakeId);
                    await handleOutcome({
                      kind: 'task',
                      intakeId: action.intakeId,
                      task,
                    });
                  })
                }
              >
                作为新待办
              </button>
            </div>
          </section>
        )}
        {selection ? (
          <section
            ref={candidates}
            className="quick-candidates"
            aria-label="选择完成事项"
          >
            <h2>是哪一项完成了？</h2>
            <p>选择前不会改变事项状态。</p>
            {selection.candidates.map((candidate) => (
              <button
                key={candidate.id}
                disabled={working}
                onClick={() => select(candidate)}
              >
                <strong>{candidate.title}</strong>
                <span>
                  {candidate.recordDate}
                  {candidate.contact ? ` · ${candidate.contact}` : ''}
                </span>
              </button>
            ))}
            <button
              className="quick-cancel"
              disabled={working}
              onClick={() => {
                setSelection(null);
                setError('');
                focusInput();
              }}
            >
              重新描述
            </button>
          </section>
        ) : (
          <>
            {queryError && (
              <div className="today-error" role="alert">
                <p>{queryError}</p>
                <button disabled={refreshing} onClick={() => void refresh()}>
                  重试加载
                </button>
              </div>
            )}
            {!data && !queryError && (
              <p className="today-empty" role="status">
                正在取出今天的记录…
              </p>
            )}
            {data?.tasks.length === 0 && (
              <p className="today-empty">
                今天还没有待办，在上方记下第一件事。
              </p>
            )}
            {data?.tasks.slice(0, 7).map((task) => (
              <article key={task.id} className={`today-task ${task.status}`}>
                <button
                  className="today-complete-button"
                  aria-label={
                    task.status === 'open'
                      ? `完成事项：${task.title}`
                      : `${labels[task.status]}：${task.title}`
                  }
                  aria-busy={completingId === task.id}
                  title={
                    task.status === 'open' ? '标记为完成' : labels[task.status]
                  }
                  disabled={working || task.status !== 'open'}
                  onClick={() => void complete(task)}
                >
                  <span className="today-task-marker" aria-hidden="true">
                    {task.status === 'completed' && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                      >
                        <path d="m3 8 3 3 7-7" />
                      </svg>
                    )}
                  </span>
                </button>
                <div className="today-task-content">
                  <strong title={task.title}>{task.title}</strong>
                  <div className="today-task-meta">
                    {task.dueDate && (
                      <time
                        className="today-time-chip"
                        dateTime={`${task.dueDate}${task.dueTime ? `T${task.dueTime}` : ''}`}
                      >
                        {dueLabel(task, date)}
                      </time>
                    )}
                    {task.status !== 'open' && (
                      <span>{labels[task.status]}</span>
                    )}
                    {isTaskTimePast(task, now) && (
                      <span className="today-time-past">已过时间</span>
                    )}
                    {task.contact && <span>{task.contact}</span>}
                  </div>
                </div>
              </article>
            ))}
            {data && data.tasks.length > 7 && (
              <p className="today-more">还有 {data.tasks.length - 7} 项</p>
            )}
          </>
        )}
      </div>
      <footer>
        <button
          disabled={working}
          onClick={() => {
            api.focusMain();
          }}
        >
          打开完整记录 <span aria-hidden="true">↗</span>
        </button>
        <span className="quick-draft-note">
          {draft.trim() ? '收起保留草稿' : 'Esc 收起'}
        </span>
      </footer>
    </main>
  );
}
