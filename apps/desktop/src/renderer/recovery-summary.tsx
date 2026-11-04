import { useCallback, useEffect, useRef, useState } from "react";
import type { RecoverySummaryApi } from "@acenote/contracts";

export function RecoverySummary({
  api,
  onOpen,
  disabled,
}: {
  api: RecoverySummaryApi;
  onOpen: () => void;
  disabled: boolean;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++request.current;
    try {
      const result = await api.getRecoverableSummary();
      if (seq === request.current) {
        setCount(result.count);
        setError(false);
      }
    } catch {
      if (seq === request.current) setError(true);
    }
  }, [api]);
  useEffect(() => {
    const off = api.onInputsChanged(() => void refresh());
    void refresh();
    return () => {
      request.current += 1;
      off();
    };
  }, [api, refresh]);
  if (error)
    return (
      <div className="quick-recovery" role="alert">
        待处理数量暂不可用{" "}
        <button aria-label="重新加载待处理数量" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  if (count === null || count === 0) return null;
  return (
    <div className="quick-recovery">
      <button disabled={disabled} onClick={onOpen}>
        待处理输入 {count} <span aria-hidden="true">↗</span>
      </button>
      <span>原文已保存，可继续处理</span>
    </div>
  );
}
