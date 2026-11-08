import { useEffect, useRef, useState } from "react";
import type { ReparseMode, Task } from "@acenote/contracts";
import { DialogShell } from "./dialog-shell";

interface ReparseDialogProps {
  task: Task;
  onClose: () => void;
  onConfirm: (mode: ReparseMode) => Promise<void>;
  error?: string;
  notice?: string;
  needsRefresh?: boolean;
  onRefresh?: () => Promise<void>;
}

export function ReparseDialog({
  task,
  onClose,
  onConfirm,
  error,
  notice,
  needsRefresh,
  onRefresh,
}: ReparseDialogProps) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const lock = useRef(false);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    const current = epoch.current;
    setBusy(true);
    setLocalError("");
    try {
      await operation();
    } catch {
      if (current === epoch.current)
        setLocalError("结果尚未确认，请刷新记录后核对。");
    } finally {
      lock.current = false;
      if (current === epoch.current) setBusy(false);
    }
  }
  async function confirm(mode: ReparseMode) {
    if (!needsRefresh) await run(() => onConfirm(mode));
  }
  return (
    <DialogShell
      labelledBy="reparse-title"
      compact
      busy={busy}
      onClose={onClose}
    >
      <p className="eyebrow">REPLAY THIS POINT</p>
      <h2 id="reparse-title">重新识别这条记录？</h2>
      <blockquote className="original-text">{task.rawText}</blockquote>
      <p className="dialog-copy">
        默认保留已有内容，仅补充空缺字段。标题已有内容就会保留，之前清空的字段也可能被补回。
      </p>
      <p className="dialog-copy">
        覆盖会替换标题、截止日期、时刻和对接人，未识别到的可选内容会清空。日期含义仍以原记录时间为准。
      </p>
      {busy && <p role="status">正在处理，请稍候…</p>}
      {notice && <p role="status">{notice}</p>}
      {(error || localError) && (
        <p className="form-error" role="alert">
          {error || localError}
        </p>
      )}
      <div className="reparse-options">
        <button
          data-autofocus
          disabled={busy || needsRefresh}
          className="primary-button"
          onClick={() => void confirm("preserve")}
        >
          保留修改并识别<span>→</span>
        </button>
        <button
          disabled={busy || needsRefresh}
          className="secondary-button danger"
          onClick={() => void confirm("replace")}
        >
          覆盖并重新识别
        </button>
      </div>
      {needsRefresh && onRefresh && (
        <button
          disabled={busy}
          className="secondary-button"
          onClick={() => void run(onRefresh)}
        >
          刷新记录
        </button>
      )}
      <button
        disabled={busy}
        className="text-button dialog-cancel"
        onClick={onClose}
      >
        取消
      </button>
    </DialogShell>
  );
}
