import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CompletionCandidate,
  DailyCompletionSummary,
  EditorApi,
  ExperienceApi,
  InputOutcome,
  LifecycleApi,
  LifecycleTask,
  ReminderApi,
  ReminderView,
  TaskStatusFilter,
} from '@acenote/contracts';
import { DateNavigator, todayLocal } from './date-navigator';
import { CaptureComposer } from './capture-composer';
import { LifecycleTaskList } from './lifecycle-task-list';
import { CompletionPicker } from './completion-picker';
import { CourtView } from './court-view';
import { ReminderCenter } from './reminder-center';
import { TaskEditor } from './task-editor';

interface LifecyclePageProps {
  api: LifecycleApi;
  editorApi: EditorApi;
  reminderApi: ReminderApi;
  experienceApi: ExperienceApi;
}
const filters = [
  ['all', '全部'],
  ['open', '未完成'],
  ['completed', '已完成'],
  ['archived', '已归档'],
] as const;
const errorText = (error: unknown) =>
  error instanceof Error && error.message.includes('NOT_CONFIGURED')
    ? '尚未配置 DeepSeek，原文已保存。'
    : '操作未完成，本地记录不会丢失，请重试。';

export function LifecyclePage({
  api,
  editorApi,
  reminderApi,
  experienceApi,
}: LifecyclePageProps) {
  const [date, setDate] = useState(todayLocal());
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [snapshot, setSnapshot] = useState<{
    date: string;
    tasks: LifecycleTask[];
    summary: DailyCompletionSummary;
  } | null>(null);
  const [queryError, setQueryError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Extract<
    InputOutcome,
    { kind: 'no_match' | 'failed' }
  > | null>(null);
  const [selection, setSelection] = useState<{
    intakeId: string;
    candidates: CompletionCandidate[];
  } | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [editing, setEditing] = useState<LifecycleTask | null>(null);
  const [reminders, setReminders] = useState<ReminderView[]>([]);
  const request = useRef(0);
  const inputLock = useRef(false);
  const taskLock = useRef(false);
  const today = todayLocal();

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setRefreshing(true);
    setQueryError('');
    try {
      const [tasks, summary] = await Promise.all([
        api.listTasks(date, 'all'),
        api.getDailySummary(date),
      ]);
      if (sequence === request.current) setSnapshot({ date, tasks, summary });
    } catch {
      if (sequence === request.current)
        setQueryError('记录加载失败，请重新加载。已有记录仍保存在本地。');
    } finally {
      if (sequence === request.current) setRefreshing(false);
    }
  }, [api, date]);
  const latestRefresh = useRef(refresh);
  useEffect(() => {
    latestRefresh.current = refresh;
    void refresh();
    return () => {
      request.current += 1;
    };
  }, [refresh]);
  useEffect(
    () => experienceApi.onDataChanged(() => void latestRefresh.current()),
    [experienceApi],
  );
  useEffect(
    () =>
      reminderApi.onReminderDue(({ reminder }) => {
        setReminders((current) =>
          current.some((item) => item.id === reminder.id)
            ? current
            : [...current, reminder].sort((a, b) =>
                a.scheduledAt.localeCompare(b.scheduledAt),
              ),
        );
      }),
    [reminderApi],
  );

  const current = snapshot?.date === date ? snapshot : null;
  const tasks = current?.tasks ?? [];
  const visibleTasks =
    status === 'all' ? tasks : tasks.filter((task) => task.status === status);
  const loading = !current && !queryError;

  async function applyOutcome(outcome: InputOutcome) {
    if (outcome.kind === 'selection_required') {
      setSelectionError('');
      setSelection(outcome);
      return;
    }
    if (outcome.kind === 'failed' || outcome.kind === 'no_match') {
      setAction(outcome);
      return;
    }
    setDraft('');
    setAction(null);
    setNotice(
      outcome.kind === 'task'
        ? '新的一球，已经记下。'
        : `“${outcome.task.title}”已完成，漂亮的一分。`,
    );
    await latestRefresh.current();
  }
  async function runInput(operation: () => Promise<InputOutcome>) {
    if (inputLock.current) return;
    inputLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await applyOutcome(await operation());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      inputLock.current = false;
      setBusy(false);
    }
  }
  function submit() {
    const rawText = draft.trim();
    if (!rawText || inputLock.current) return;
    setAction(null);
    void runInput(() => api.submitInput(rawText));
  }
  async function convertAction() {
    if (!action || inputLock.current) return;
    inputLock.current = true;
    setBusy(true);
    setError('');
    try {
      await api.convertInputToTask(action.intakeId);
      setDraft('');
      setAction(null);
      setNotice('已将原文保存为新待办。');
      await latestRefresh.current();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      inputLock.current = false;
      setBusy(false);
    }
  }
  async function changeStatus(
    task: LifecycleTask,
    kind: 'archive' | 'restore',
  ) {
    if (taskLock.current) return;
    taskLock.current = true;
    setBusyId(task.id);
    setError('');
    try {
      if (kind === 'archive') await api.archiveTask(task.id, task.revision);
      else await api.restoreTask(task.id, task.revision);
      await latestRefresh.current();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      taskLock.current = false;
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell workspace-shell">
      <main className="main-content workspace-content">
        <header className="top-bar">
          <div className="workspace-brand">
            <span className="brand-ball" aria-hidden="true" />
            <span className="wordmark">
              AceNote<span className="brand-period">.</span>
            </span>
            <span className="brand-tagline">记下这一球，拿下下一分。</span>
          </div>
          <span className="local-badge">
            <span className="live-dot" />
            本地优先
          </span>
        </header>
        <section className="workspace-heading" aria-label="每日记录概览">
          <div>
            <p className="eyebrow">YOUR DAILY COURT</p>
            <h1>
              每日记录
              <span className="day-label">
                {date === today ? '今天' : date}
              </span>
            </h1>
          </div>
          <div className="workspace-date">
            <DateNavigator date={date} onChange={setDate} />
            <div className="completion-total" aria-label="当日完成">
              <strong>{current ? current.summary.completedCount : '—'}</strong>
              <span>当日完成</span>
            </div>
          </div>
        </section>
        {date !== today && (
          <p className="history-hint">
            {date < today ? '正在查看历史记录' : '正在查看其他日期'}
            ，新记录仍保存在今天。
            <button className="text-button" onClick={() => setDate(today)}>
              回到今天
            </button>
          </p>
        )}
        <div className="practice-grid">
          <CaptureComposer
            draft={draft}
            busy={busy}
            onChange={setDraft}
            onSubmit={submit}
          />
          {current ? (
            <CourtView
              tasks={visibleTasks}
              selectedId={editing?.id ?? null}
              onSelect={setEditing}
            />
          ) : (
            <div className="court-placeholder" role="status">
              {queryError
                ? '球场暂不可用，请重新加载记录。'
                : '正在准备这一天的球场…'}
            </div>
          )}
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="关闭操作提示" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="notice-banner" role="status">
            <span>{notice}</span>
            {date !== today && (
              <button className="text-button" onClick={() => setDate(today)}>
                回到今天
              </button>
            )}
            <button
              className="text-button"
              aria-label="关闭成功提示"
              onClick={() => setNotice('')}
            >
              关闭
            </button>
          </div>
        )}
        {action && (
          <div className="action-banner">
            <span>
              {action.kind === 'failed'
                ? '这句话还没理解，原文已经保存。'
                : action.message}
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void runInput(() => api.retryInput(action.intakeId))
              }
            >
              重试识别
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void convertAction()}
            >
              作为新待办
            </button>
          </div>
        )}
        <section
          className="records-section workspace-records"
          aria-label="任务记录"
          aria-busy={refreshing}
        >
          <div className="records-toolbar">
            <h2>
              当日记录 <span>{current ? tasks.length : '—'}</span>
            </h2>
            <div className="status-tabs" role="group" aria-label="任务状态筛选">
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  aria-label={label}
                  aria-pressed={status === value}
                  className={status === value ? 'active' : ''}
                  onClick={() => setStatus(value)}
                >
                  {label}
                  <span aria-hidden="true">
                    {current
                      ? value === 'all'
                        ? tasks.length
                        : tasks.filter((task) => task.status === value).length
                      : '—'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {queryError && (
            <div className="error-banner" role="alert">
              <span>{queryError}</span>
              <button onClick={() => void refresh()}>重新加载</button>
            </div>
          )}
          {(!queryError || current) && (
            <LifecycleTaskList
              tasks={visibleTasks}
              loading={loading}
              busyId={busyId}
              today={today}
              nowTime={new Date().toTimeString().slice(0, 5)}
              selectedId={editing?.id}
              filter={status}
              onShowAll={() => setStatus('all')}
              onArchive={(task) => void changeStatus(task, 'archive')}
              onRestore={(task) => void changeStatus(task, 'restore')}
              onEdit={setEditing}
            />
          )}
        </section>
        <footer className="page-footer">
          <span>
            <span className="live-dot" /> 原文先保存，安心记下每一球。
          </span>
          <span>ACE THE EVERYDAY</span>
        </footer>
        <ReminderCenter
          reminders={reminders}
          onDismiss={async (reminder) => {
            await reminderApi.dismissReminder(reminder.id);
            setReminders((current) =>
              current.filter((item) => item.id !== reminder.id),
            );
          }}
        />
        {selection && !editing && (
          <CompletionPicker
            candidates={selection.candidates}
            busy={busy}
            error={selectionError}
            onCancel={() => setSelection(null)}
            onSelect={async (candidate) => {
              if (inputLock.current) return;
              inputLock.current = true;
              setBusy(true);
              setSelectionError('');
              try {
                await api.selectCandidate({
                  intakeId: selection.intakeId,
                  taskId: candidate.id,
                  revision: candidate.revision,
                });
                setSelection(null);
                setAction(null);
                setDraft('');
                setNotice('已记录完成，漂亮的一分。');
                await latestRefresh.current();
              } catch {
                setSelectionError(
                  '未能完成选择，事项可能已变更。请重试或取消后重新描述。',
                );
              } finally {
                inputLock.current = false;
                setBusy(false);
              }
            }}
          />
        )}
        {editing && (
          <TaskEditor
            key={editing.id}
            task={editing}
            onClose={() => setEditing(null)}
            onSave={async (patch, revision) => {
              await editorApi.updateTask(editing.id, patch, revision);
              setEditing(null);
              setNotice('修改已保存。');
              await latestRefresh.current();
            }}
          />
        )}
      </main>
    </div>
  );
}
