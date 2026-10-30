import { useRef, type KeyboardEvent } from 'react';
interface CaptureComposerProps {
  draft: string;
  busy: boolean;
  onChange: (draft: string) => void;
  onSubmit: () => void;
  heading?: string;
  inputLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'compact';
}
export function CaptureComposer({
  draft,
  busy,
  onChange,
  onSubmit,
  heading = '记下一件事',
  inputLabel = '待办或完成指令',
  placeholder = '明天下午三点前，把设计稿发给小王…',
  autoFocus = false,
  disabled = false,
  variant = 'default',
}: CaptureComposerProps) {
  const composing = useRef(false);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const compact = variant === 'compact';
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const shortcut = event.metaKey || event.ctrlKey;
    if (
      event.key !== 'Enter' ||
      (!shortcut && (!compact || event.shiftKey || event.altKey))
    )
      return;
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    event.preventDefault();
    if (!busy && !disabled && draft.trim()) onSubmit();
  }
  const input = (
    <textarea
      id="capture-draft"
      aria-label={inputLabel}
      autoFocus={autoFocus}
      value={draft}
      readOnly={busy || disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={keyDown}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      placeholder={placeholder}
      maxLength={2000}
      rows={compact ? 1 : 2}
    />
  );
  const button = (
    <button
      className="primary-button"
      aria-label={compact ? (busy ? '正在理解…' : '记录') : undefined}
      title={compact ? '记录（Enter）' : undefined}
      onClick={onSubmit}
      disabled={busy || disabled || !draft.trim()}
    >
      {compact ? (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5m-6 6 6-6 6 6" />
        </svg>
      ) : (
        <>
          {busy ? '正在理解…' : '记录'}
          <span aria-hidden="true">↗</span>
        </>
      )}
    </button>
  );
  return (
    <section
      className={`capture-card capture-composer${compact ? ' capture-composer-compact' : ''}`}
      aria-label="统一输入"
      aria-busy={busy}
    >
      <div className="composer-heading" hidden={compact}>
        <label htmlFor="capture-draft">{heading}</label>
        <span>也可以说“写周报已完成”</span>
      </div>
      {compact ? (
        <>
          <div className="capture-entry">
            {input}
            {button}
          </div>
          <div className="compact-input-hint">
            <span>
              {busy ? '正在理解这条记录…' : 'Enter 记录 · Shift+Enter 换行'}
            </span>
            {draft.length > 0 && <span>{draft.length} / 2000</span>}
          </div>
        </>
      ) : (
        <>
          {input}
          <div className="capture-footer">
            <span className="shortcut">
              <kbd>{mac ? '⌘' : 'Ctrl'}</kbd>
              <kbd>↵</kbd>
              <span className="char-count">{draft.length} / 2000</span>
            </span>
            {button}
          </div>
        </>
      )}
    </section>
  );
}
