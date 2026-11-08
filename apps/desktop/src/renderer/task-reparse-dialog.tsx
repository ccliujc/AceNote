import { useEffect, useRef, useState } from "react";
import {
  lifecycleTaskSchema,
  taskReparseOutcomeSchema,
  type LifecycleApi,
  type LifecycleTask,
  type ReparseMode,
  type TaskReparseApi,
  type TaskReparseError,
  type TaskReparseOutcome,
} from "@acenote/contracts";
import { ReparseDialog } from "./reparse-dialog";

const messages: Record<TaskReparseError, string> = {
  INVALID_INPUT: "原记录信息无法用于识别，请核对记录或手动编辑。",
  NOT_FOUND: "这条记录已不存在，请刷新核对。",
  STORAGE_ERROR: "本地保存未完成，原内容保持，请重试。",
  NETWORK_ERROR: "无法连接解析服务，请恢复连接后重试。",
  PARSE_TIMEOUT: "识别超时，原内容保持，请重试。",
  PARSE_UNAVAILABLE: "解析服务暂不可用，请稍后重试。",
  PARSE_INVALID_RESPONSE: "识别结果格式不正确，原内容保持，请重试或手动编辑。",
  PARSE_NOT_CONFIGURED:
    "尚未配置 DeepSeek 密钥，配置后可重试，也可以手动编辑。",
  CONCURRENT_EDIT: "记录已被其他操作更新，请先刷新，再重新选择识别方式。",
  UNKNOWN_ERROR: "本次识别未完成，原内容保持，请重试。",
  REPARSE_BUSY: "这条记录正在识别，请稍后重试。",
  REPARSE_UNSUPPORTED_INTENT:
    "本次识别得到完成指令，不能用于更新字段，原内容保持。",
  REPARSE_INTERRUPTED: "本次识别已中断，请重新打开记录后重试。",
};
interface Props {
  task: LifecycleTask;
  api: TaskReparseApi;
  lifecycle: Pick<LifecycleApi, "listTasks">;
  onClose: () => void;
  onUpdated: (
    outcome: Extract<TaskReparseOutcome, { kind: "updated" }>,
  ) => void;
}
export function TaskReparseDialog({
  task,
  api,
  lifecycle,
  onClose,
  onUpdated,
}: Props) {
  const [current, setCurrent] = useState(task);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );
  async function confirm(mode: ReparseMode) {
    const sequence = epoch.current;
    setError("");
    setNotice("");
    try {
      const outcome = taskReparseOutcomeSchema.parse(
        await api.reparseTask({
          id: current.id,
          revision: current.revision,
          mode,
        }),
      );
      if (epoch.current !== sequence) return;
      if (outcome.kind === "updated") {
        onUpdated(outcome);
        return;
      }
      setError(messages[outcome.error]);
      setNeedsRefresh(
        outcome.error === "CONCURRENT_EDIT" || outcome.error === "NOT_FOUND",
      );
    } catch {
      if (epoch.current !== sequence) return;
      setNeedsRefresh(true);
      setError("结果尚未确认，请刷新记录核对，避免重复识别。");
    }
  }
  async function refresh() {
    const sequence = epoch.current;
    setError("");
    setNotice("");
    try {
      const tasks = await lifecycle.listTasks(current.recordDate, "all");
      if (sequence !== epoch.current) return;
      const found = tasks.find((t) => t.id === current.id);
      if (!found) {
        setError(messages.NOT_FOUND);
        return;
      }
      setCurrent(lifecycleTaskSchema.parse(found));
      setNeedsRefresh(false);
      setNotice("记录已刷新，请重新选择识别方式。");
    } catch {
      if (sequence === epoch.current)
        setError("刷新记录失败，请重试。识别不会自动再次执行。");
    }
  }
  return (
    <ReparseDialog
      task={current}
      onClose={onClose}
      onConfirm={confirm}
      error={error}
      notice={notice}
      needsRefresh={needsRefresh}
      onRefresh={refresh}
    />
  );
}
