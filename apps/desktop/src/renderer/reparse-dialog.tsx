import { useState } from 'react';
import type { ReparseMode, Task } from '@acenote/contracts';

interface ReparseDialogProps {
  task: Task;
  onClose: () => void;
  onConfirm: (mode: ReparseMode) => Promise<void>;
}

export function ReparseDialog({ task, onClose, onConfirm }: ReparseDialogProps) {
  const [busy, setBusy] = useState(false);
  async function confirm(mode: ReparseMode) {
    setBusy(true);
    try { await onConfirm(mode); } finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal-panel compact" role="dialog" aria-modal="true" aria-labelledby="reparse-title">
        <p className="eyebrow">REPLAY THIS POINT</p>
        <h2 id="reparse-title">重新识别这条记录？</h2>
        <blockquote className="original-text">{task.rawText}</blockquote>
        <p className="dialog-copy">默认保留你的手动修改，仅补充仍为空的字段。也可以明确选择用新识别结果覆盖当前字段。</p>
        <div className="reparse-options">
          <button disabled={busy} className="primary-button" onClick={() => void confirm('preserve')}>保留修改并识别<span>→</span></button>
          <button disabled={busy} className="secondary-button danger" onClick={() => void confirm('replace')}>覆盖并重新识别</button>
        </div>
        <button disabled={busy} className="text-button dialog-cancel" onClick={onClose}>取消</button>
      </section>
    </div>
  );
}
