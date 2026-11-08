import {
  parsedTaskSchema,
  reparseModeSchema,
  type ParsedTask,
  type ReparseMode,
} from "@acenote/contracts";

export function mergeReparseFields(
  current: ParsedTask,
  input: ParsedTask,
  mode: ReparseMode,
): ParsedTask {
  const before = parsedTaskSchema.parse({
    title: current.title,
    dueDate: current.dueDate,
    dueTime: current.dueTime,
    contact: current.contact,
  });
  const result = parsedTaskSchema.parse(input);
  if (reparseModeSchema.parse(mode) === "replace") return result;
  return parsedTaskSchema.parse({
    title: before.title,
    contact: before.contact ?? result.contact,
    dueDate: before.dueDate ?? result.dueDate,
    dueTime: before.dueDate
      ? (before.dueTime ??
        (result.dueDate === before.dueDate ? result.dueTime : null))
      : result.dueTime,
  });
}
