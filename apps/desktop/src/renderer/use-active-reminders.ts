import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  activeReminderStateSchema,
  type ActiveReminderReadApi,
  type ActiveReminderState,
} from "@acenote/contracts";

export function useActiveReminders(
  api: ActiveReminderReadApi,
  onState?: (state: ActiveReminderState) => void,
) {
  const [snapshot, setSnapshot] = useState<ActiveReminderState | null>(null);
  const [error, setError] = useState("");
  const latest = useRef<ActiveReminderState | null>(null);
  const callback = useRef(onState),
    epoch = useRef(0),
    request = useRef(0),
    observation = useRef(0),
    alive = useRef(false);
  useLayoutEffect(() => {
    callback.current = onState;
  });
  const accept = useCallback((value: ActiveReminderState) => {
    if (!alive.current) return;
    const next = activeReminderStateSchema.parse(value),
      old = latest.current;
    if (
      old &&
      (old.sessionId !== next.sessionId || old.revision >= next.revision)
    )
      return;
    latest.current = next;
    observation.current += 1;
    setSnapshot(next);
    setError("");
    callback.current?.(next);
  }, []);
  const refresh = useCallback(async () => {
    const generation = epoch.current,
      sequence = ++request.current,
      observed = observation.current;
    try {
      const next = await api.getActiveReminders();
      if (
        !alive.current ||
        generation !== epoch.current ||
        sequence !== request.current
      )
        return;
      accept(next);
      setError("");
    } catch {
      if (
        alive.current &&
        generation === epoch.current &&
        sequence === request.current &&
        observed === observation.current
      )
        setError("活动提醒加载失败，请重试。");
    }
  }, [api, accept]);
  useEffect(() => {
    alive.current = true;
    const generation = ++epoch.current;
    latest.current = null;
    setSnapshot(null);
    setError("");
    const off = api.onActiveRemindersChanged((value) => {
      if (generation === epoch.current) accept(value);
    });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    void refresh();
    return () => {
      alive.current = false;
      epoch.current += 1;
      off();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [api, accept, refresh]);
  return { snapshot, error, refresh, accept };
}
