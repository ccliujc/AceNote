import { useState, type FormEvent } from 'react';
import type { Task, TaskPatch } from '@acenote/contracts';

interface TaskEditorProps {
  task: Task;
  onClose: () => void;
  onSave: (patch: TaskPatch, revision: number) => Promise<void>;
}

export function TaskEditor({ task, onClose, onSave }: TaskEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [dueTime, setDueTime] = useState(task.dueTime ?? '');
  const [contact, setContact] = useState(task.contact ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setError('事项标题不能为空。');
    if (dueTime && !dueDate) return setError('填写具体时刻前，请先选择截止日期。');
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        contact: contact.trim() || null,
      }, task.revision);
    } catch {
      setError('保存失败，记录可能已在其他窗口修改，请刷新后重试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="modal-heading"><div><p className="eyebrow">EDIT RECORD</p><h2 id="edit-title">核对这一球</h2></div><button className="close-button" aria-label="关闭编辑" onClick={onClose}>×</button></div>
        <blockquote className="original-text">{task.rawText}</blockquote>
        <p className="immutable-meta">记录于 {task.recordedAt} · 原始文字与记录时间不可修改</p>
        <form onSubmit={(event) => void save(event)}>
          <label className="field field-wide">事项标题<input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="field-row">
            <label className="field">截止日期<input aria-label="截止日期" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label className="field">具体时间<input aria-label="具体时间" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} /></label>
          </div>
          <label className="field field-wide">对接人<input value={contact} maxLength={100} placeholder="未提及可留空" onChange={(event) => setContact(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存修改'}<span>→</span></button></div>
        </form>
      </section>
    </div>
  );
}
