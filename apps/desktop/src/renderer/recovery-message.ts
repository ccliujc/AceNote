import type { ErrorCode } from "@acenote/contracts";

const messages: Partial<Record<ErrorCode, string>> = {
  INPUT_INTERRUPTED: "上次处理被中断，原文已保存，可以继续。",
  INPUT_BUSY: "这条输入正在处理中，请稍后再试。",
  INPUT_ALREADY_RESOLVED: "这条输入已处理，列表已更新。",
  CONCURRENT_EDIT: "内容已发生变化，请确认最新记录后重试。",
  NO_MATCH: "目前没有匹配的未完成事项。",
  PARSE_NOT_CONFIGURED: "尚未配置 DeepSeek，可先转为新待办并手动编辑。",
  PARSE_INVALID_RESPONSE: "识别结果不可用，原文已保存，请重试。",
  NETWORK_ERROR: "暂时连接不上识别服务，原文已保存。",
  PARSE_UNAVAILABLE: "识别服务暂不可用，原文已保存。",
  PARSE_TIMEOUT: "识别超时，原文已保存，请重试。",
};
export function recoveryMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error ?? "");
  return (
    Object.entries(messages).find(([code]) => value.includes(code))?.[1] ??
    "操作未完成，原文仍保存在本地，请刷新后重试。"
  );
}
