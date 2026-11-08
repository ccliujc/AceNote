import { z } from "zod";
import { reparseModeSchema } from "./capture";
import { lifecycleTaskSchema } from "./lifecycle";

export const taskReparseRequestSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    mode: reparseModeSchema,
  })
  .strict();

// These errors describe an operation; they are never persisted as task state.
export const taskReparseErrorSchema = z.enum([
  "INVALID_INPUT",
  "NOT_FOUND",
  "STORAGE_ERROR",
  "NETWORK_ERROR",
  "PARSE_TIMEOUT",
  "PARSE_UNAVAILABLE",
  "PARSE_INVALID_RESPONSE",
  "PARSE_NOT_CONFIGURED",
  "CONCURRENT_EDIT",
  "UNKNOWN_ERROR",
  "REPARSE_BUSY",
  "REPARSE_UNSUPPORTED_INTENT",
  "REPARSE_INTERRUPTED",
]);

export const taskReparseOutcomeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("updated"),
      task: lifecycleTaskSchema.strict(),
      warning: z.literal("REMINDER_SYNC_FAILED").nullable(),
    })
    .strict(),
  z
    .object({ kind: z.literal("failed"), error: taskReparseErrorSchema })
    .strict(),
]);

export type TaskReparseRequest = z.infer<typeof taskReparseRequestSchema>;
export type TaskReparseError = z.infer<typeof taskReparseErrorSchema>;
export type TaskReparseOutcome = z.infer<typeof taskReparseOutcomeSchema>;

export interface TaskReparseApi {
  reparseTask(request: TaskReparseRequest): Promise<TaskReparseOutcome>;
}
