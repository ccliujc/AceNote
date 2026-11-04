import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CompletionCandidate,
  LifecycleApi,
  RecoverableInput,
  RecoveryApi,
  RecoveryCandidates,
} from "@acenote/contracts";
import { CompletionPicker } from "./completion-picker";
import { DialogShell } from "./dialog-shell";
import { recoveryMessage } from "./recovery-message";

const states = {
  processing: "处理中",
  interrupted: "处理被中断",
  failed: "识别未完成",
  awaiting_selection: "等待确认",
};
interface Props {
  api: RecoveryApi;
  lifecycle: LifecycleApi;
  onViewDate?: (date: string) => void;
}

export function RecoverableInputs({ api, lifecycle, onViewDate }: Props) {
  const [rows, setRows] = useState<RecoverableInput[] | null>(null);
  const [queryError, setQueryError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selection, setSelection] = useState<RecoveryCandidates | null>(null);
  const sequence = useRef(0),
    locked = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++sequence.current;
    try {
      const next = await api.listInputs();
      if (version !== sequence.current) return;
      setRows(next);
      setQueryError("");
      setSelection((current) => {
        if (!current) return null;
        const row = next.find((item) => item.id === current.intakeId);
        return !row || row.revision > current.intakeRevision ? null : current;
      });
      return next;
    } catch {
      if (version === sequence.current)
        setQueryError("待处理输入加载失败，请重新加载。");
    }
  }, [api]);
  useEffect(() => {
    const off = api.onInputsChanged(() => void refresh());
    void refresh();
    return () => {
      sequence.current += 1;
      off();
    };
  }, [api, refresh]);
  async function run(id: string, operation: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await operation();
      await refresh();
    } catch (reason) {
      setError(recoveryMessage(reason));
      const latest = await refresh();
      if (selection?.intakeId === id && latest) {
        const row = latest.find((item) => item.id === id);
        if (row?.canSelect) {
          try {
            setSelection(await api.getCandidates(row.id, row.revision));
          } catch {
            setSelection(null);
          }
        } else setSelection(null);
      }
    } finally {
      locked.current = false;
      setBusyId(null);
    }
  }
  function retry(row: RecoverableInput) {
    void run(row.id, async () => {
      const result = await lifecycle.retryInput(row.id, row.revision);
      if (result.kind === "selection_required")
        setSelection(
          await api.getCandidates(result.intakeId, result.intakeRevision),
        );
      else if (result.kind === "failed")
        setError(recoveryMessage(result.error));
      else if (result.kind === "no_match") setError(result.message);
      else
        setNotice(
          result.kind === "task"
            ? `已找回并保存“${result.task.title}”。`
            : `“${result.task.title}”已完成。`,
        );
    });
  }
  function convert(id: string, revision: number) {
    void run(id, async () => {
      const task = await lifecycle.convertInputToTask(id, revision);
      setSelection(null);
      setNotice(`已将原文保存为“${task.title}”，可在记录中编辑。`);
    });
  }
  function select(candidate: CompletionCandidate) {
    if (!selection) return;
    const current = selection;
    void run(current.intakeId, async () => {
      const task = await lifecycle.selectCandidate({
        intakeId: current.intakeId,
        intakeRevision: current.intakeRevision,
        taskId: candidate.id,
        revision: candidate.revision,
      });
      setSelection(null);
      setNotice(`“${task.title}”已完成。`);
    });
  }
  return (
    <section className="recovery-panel" aria-label="待处理输入">
      <header className="recovery-heading">
        <div>
          <h2>
            待处理输入 <span>{rows?.length ?? "—"}</span>
          </h2>
          <p>已提交但还未处理完的原文，按接收时间保留。</p>
        </div>
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      </header>
      {queryError && (
        <div className="error-banner" role="alert">
          <span>{queryError}</span>
          <button onClick={() => void refresh()}>重新加载待处理输入</button>
        </div>
      )}
      {error && !selection && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="recovery-notice" role="status">
          {notice}
        </p>
      )}
      {expanded && (
        <div className="recovery-list">
          {!rows && !queryError && <p role="status">正在读取待处理输入…</p>}
          {rows?.length === 0 && (
            <p className="recovery-empty">暂无待处理输入</p>
          )}
          {rows?.map((row) => (
            <article
              className="recovery-item"
              key={row.id}
              aria-label={`待处理：${row.rawText}`}
            >
              <div className="recovery-item-heading">
                <span>{states[row.viewState]}</span>
                <time dateTime={row.receivedAt}>
                  {row.localDate} · {row.timeZone}
                </time>
              </div>
              <p className="recovery-raw">{row.rawText}</p>
              {row.error && (
                <p className="recovery-reason">{recoveryMessage(row.error)}</p>
              )}
              {row.legacyUnlinked && (
                <p className="recovery-reason">
                  此记录来自旧版本，请先核对接收当天的已有事项，避免重复记录。
                  {onViewDate && (
                    <button
                      className="text-button"
                      onClick={() => onViewDate(row.localDate)}
                    >
                      查看接收日任务
                    </button>
                  )}
                </p>
              )}
              <div className="recovery-actions" aria-busy={busyId === row.id}>
                {row.canRetry && (
                  <button
                    className="text-button"
                    disabled={busyId !== null}
                    onClick={() => retry(row)}
                  >
                    重试识别
                  </button>
                )}
                {row.canSelect && (
                  <button
                    className="text-button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void run(row.id, async () =>
                        setSelection(
                          await api.getCandidates(row.id, row.revision),
                        ),
                      )
                    }
                  >
                    继续选择
                  </button>
                )}
                {row.canConvert && (
                  <button
                    className="text-button"
                    disabled={busyId !== null}
                    onClick={() => convert(row.id, row.revision)}
                  >
                    作为新待办
                  </button>
                )}
                {(row.viewState === "processing" || busyId === row.id) && (
                  <span role="status">正在处理…</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {selection &&
        !selection.requiresReparse &&
        selection.candidates.length > 0 && (
          <CompletionPicker
            candidates={selection.candidates}
            busy={busyId !== null}
            error={error}
            description="请确认要完成的事项。确认前不会改变任务状态。"
            onSelect={select}
            onCancel={() => setSelection(null)}
          />
        )}
      {selection &&
        (selection.requiresReparse || selection.candidates.length === 0) && (
          <DialogShell
            labelledBy="recover-pick-title"
            busy={busyId !== null}
            onClose={() => setSelection(null)}
            compact
          >
            <h2 id="recover-pick-title">继续处理完成指令</h2>
            <p>
              {selection.requiresReparse
                ? "旧记录尚未保存完成目标，需要重新识别后选择。"
                : "目前没有匹配的未完成事项，原文仍保留。"}
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {selection.requiresReparse && (
              <button
                className="primary-button"
                disabled={busyId !== null}
                onClick={() =>
                  void run(selection.intakeId, async () =>
                    setSelection(
                      await api.reparseCandidates(
                        selection.intakeId,
                        selection.intakeRevision,
                      ),
                    ),
                  )
                }
              >
                重新识别候选
              </button>
            )}
            <button
              className="text-button"
              disabled={busyId !== null}
              onClick={() =>
                convert(selection.intakeId, selection.intakeRevision)
              }
            >
              作为新待办
            </button>
            <button
              className="text-button"
              disabled={busyId !== null}
              onClick={() => setSelection(null)}
            >
              取消
            </button>
          </DialogShell>
        )}
    </section>
  );
}
