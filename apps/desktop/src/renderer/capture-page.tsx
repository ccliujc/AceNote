import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { AceNoteApi, Task } from '@acenote/contracts';
import { TaskList } from './task-list';
import { TaskEditor } from './task-editor';
import { ReparseDialog } from './reparse-dialog';

interface CapturePageProps {
  api: AceNoteApi;
}

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('NOT_CONFIGURED')) return '尚未配置 DeepSeek，原文已保存，可稍后重试。';
  if (code.includes('NETWORK') || code.includes('UNAVAILABLE')) return '解析服务暂时不可用，原文已安全保存。';
  return '操作未完成，请重试。你的本地记录不会受影响。';
}

export function CapturePage({ api }: CapturePageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reparsingTask, setReparsingTask] = useState<Task | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.listTasks());
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasActiveParsing = tasks.some((task) => task.parseStatus === 'pending' || task.parseStatus === 'processing');
  useEffect(() => {
    if (!hasActiveParsing) return;
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [hasActiveParsing, refresh]);

  async function submit() {
    const rawText = draft.trim();
    if (!rawText) {
      setError('先写下一句话，再记下这一球。');
      return;
    }
    if (rawText.length > 2000) {
      setError('单条记录不能超过 2,000 个字符。');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const task = await api.submitTask(rawText);
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      setDraft('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  }

  const counts = useMemo(() => ({
    parsed: tasks.filter((task) => task.parseStatus === 'succeeded').length,
    active: tasks.filter((task) => task.parseStatus === 'pending' || task.parseStatus === 'processing').length,
  }), [tasks]);

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-mark" aria-label="AceNote"><span>A</span></div>
        <div className="rail-line" />
        <span className="rail-label">COURT<br />01</span>
        <div className="rail-bottom"><span className="live-dot" />LOCAL</div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="wordmark">ACENOTE<span>®</span></div>
          <div className="local-badge"><span className="live-dot" />本地单用户模式</div>
        </header>

        <section className="hero-section">
          <p className="eyebrow">DAILY PRACTICE · {new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date())}</p>
          <h1>今天，先拿下<br /><em>这一分。</em></h1>
          <p className="hero-copy">不用整理，不必措辞。把脑海里的事交给球场，<br />从一句话开始。</p>
        </section>

        <section className="capture-card" aria-label="快速记录">
          <div className="card-index">01 / QUICK CAPTURE</div>
          <textarea
            aria-label="待办内容"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="例如：明天下午三点前，把设计稿发给小王确认……"
            maxLength={2000}
            rows={3}
          />
          <div className="capture-footer">
            <span className="shortcut"><kbd>⌘</kbd><kbd>↵</kbd> 快速记录 <span className="char-count">{draft.length}/2000</span></span>
            <button className="primary-button" onClick={() => void submit()} disabled={submitting}>
              {submitting ? '正在保存…' : '记下这一球'}<span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        {error && <div className="error-banner" role="alert">{error}<button onClick={() => void refresh()}>刷新</button></div>}

        <section className="records-section">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR RECORDS</p><h2>今日记录</h2></div>
            <div className="record-stats">
              <span><strong>{tasks.length}</strong> 全部</span>
              <span><strong>{counts.parsed}</strong> 已识别</span>
              <span><strong>{counts.active}</strong> 识别中</span>
            </div>
          </div>
          <TaskList tasks={tasks} loading={loading} onEdit={setEditingTask} onReparse={setReparsingTask} onRetry={async (id) => {
            await api.retryParse(id);
            await refresh();
          }} />
        </section>
        {editingTask && <TaskEditor key={editingTask.id} task={editingTask} onClose={() => setEditingTask(null)} onSave={async (patch, revision) => {
          const updated = await api.updateTask(editingTask.id, patch, revision);
          setTasks((current) => current.map((task) => task.id === updated.id ? updated : task));
          setEditingTask(null);
        }} />}
        {reparsingTask && <ReparseDialog task={reparsingTask} onClose={() => setReparsingTask(null)} onConfirm={async (mode) => {
          await api.reparseTask(reparsingTask.id, mode);
          setReparsingTask(null);
          await refresh();
        }} />}
        <footer className="page-footer"><span>记下这一球，拿下下一分。</span><span>原文先保存 · 本地优先</span></footer>
      </main>
    </div>
  );
}
