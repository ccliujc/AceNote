import type { CompletionCandidate } from '@acenote/contracts';
import { DialogShell } from './dialog-shell';

interface CompletionPickerProps {
  candidates: CompletionCandidate[];
  busy: boolean;
  error?: string;
  onSelect: (candidate: CompletionCandidate) => void;
  onCancel: () => void;
}

export function CompletionPicker({
  candidates,
  busy,
  error,
  onSelect,
  onCancel,
}: CompletionPickerProps) {
  return (
    <DialogShell labelledBy="pick-title" busy={busy} onClose={onCancel} compact>
      <p className="eyebrow">WHICH ONE?</p>
      <h2 id="pick-title">是哪一项完成了？</h2>
      <p className="dialog-copy">
        找到多个匹配事项。你选择前，我不会改动任何状态。
      </p>
      <div className="candidate-list">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            disabled={busy}
            onClick={() => onSelect(candidate)}
          >
            <strong>{candidate.title}</strong>
            <span>
              {candidate.recordDate}
              {candidate.contact ? ` · ${candidate.contact}` : ''}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="text-button dialog-cancel"
        onClick={onCancel}
        disabled={busy}
      >
        取消
      </button>
    </DialogShell>
  );
}
