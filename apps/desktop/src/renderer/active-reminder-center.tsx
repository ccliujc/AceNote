import type { ActiveReminder, ReminderApi } from "@acenote/contracts";
import { useLayoutEffect, useRef } from "react";
import { ReminderCenter } from "./reminder-center";
import { useActiveReminders } from "./use-active-reminders";

export function ActiveReminderCenter({ api }: { api: ReminderApi }) {
  const { snapshot, error, refresh, accept } = useActiveReminders(api);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = panel.current!;
    const workspace = element.closest<HTMLElement>(".workspace-content");
    if (!workspace) return;
    const measure = () =>
      workspace.style.setProperty(
        "--reminder-clearance",
        `${Math.ceil(element.getBoundingClientRect().height) + 52}px`,
      );
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      workspace.style.removeProperty("--reminder-clearance");
    };
  }, []);
  async function dismiss(item: ActiveReminder) {
    if (!snapshot) return;
    try {
      accept(
        await api.dismissReminder({
          sessionId: snapshot.sessionId,
          activationId: item.activationId,
        }),
      );
    } catch (reason) {
      void refresh();
      throw reason;
    }
  }
  return (
    <aside
      ref={panel}
      className="reminder-center"
      aria-label="活动提醒"
      aria-live="polite"
    >
      <header className="reminder-heading">
        活动提醒 <span>{snapshot?.reminders.length ?? "—"}</span>
        <button className="text-button" onClick={() => void refresh()}>
          刷新提醒
        </button>
      </header>
      {!snapshot && !error && (
        <p role="status" className="reminder-state">
          正在读取活动提醒…
        </p>
      )}
      {error && (
        <div role="alert" className="reminder-state">
          {error}{" "}
          <button className="text-button" onClick={() => void refresh()}>
            重新加载提醒
          </button>
        </div>
      )}
      {snapshot?.reminders.length === 0 && (
        <p className="reminder-state">暂无活动提醒</p>
      )}
      {snapshot && (
        <ReminderCenter reminders={snapshot.reminders} onDismiss={dismiss} />
      )}
    </aside>
  );
}
