import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  parseIntentResultSchema,
  parseRequestSchema,
  taskReparseRequestSchema,
  taskReparseErrorSchema,
  type LifecycleTask,
  type TaskReparseError,
  type TaskReparseOutcome,
  type TaskReparseRequest,
} from "@acenote/contracts";
import { ParseClientError, type IntentClient } from "./parse-queue";
import type { TaskRepository } from "./task-repository";

interface TaskReparseOptions {
  idGenerator?: () => string;
  onTaskChanged?: (task: LifecycleTask) => void;
  syncTask?: (id: string) => void;
  onChanged?: () => void;
}
const failed = (error: TaskReparseError): TaskReparseOutcome => ({
  kind: "failed",
  error,
});

export class TaskReparseService {
  private readonly active = new Map<string, symbol>();
  private stopped = false;
  constructor(
    private readonly tasks: TaskRepository,
    private readonly parser: IntentClient,
    private readonly options: TaskReparseOptions = {},
  ) {}

  stop(): void {
    this.stopped = true;
    this.active.clear();
  }

  async reparseTask(input: TaskReparseRequest): Promise<TaskReparseOutcome> {
    const checked = taskReparseRequestSchema.safeParse(input);
    if (!checked.success) return failed("INVALID_INPUT");
    const request = checked.data;
    if (this.stopped) return failed("REPARSE_INTERRUPTED");
    if (this.active.has(request.id)) return failed("REPARSE_BUSY");
    const token = Symbol();
    this.active.set(request.id, token);
    let stage: "storage" | "parse" = "storage";
    let committed: { before: LifecycleTask; task: LifecycleTask };
    try {
      const before = this.tasks.get(request.id);
      if (before.revision !== request.revision)
        return failed("CONCURRENT_EDIT");
      let parseRequest;
      try {
        new Intl.DateTimeFormat("en", { timeZone: before.timeZone }).format(
          new Date(before.recordedAt),
        );
        parseRequest = parseRequestSchema.parse({
          requestId: (this.options.idGenerator ?? randomUUID)(),
          rawText: before.rawText,
          localDateTime: before.recordedAt,
          timeZone: before.timeZone,
        });
      } catch {
        return failed("INVALID_INPUT");
      }
      stage = "parse";
      const response = await this.parser(parseRequest);
      if (this.stopped || this.active.get(request.id) !== token)
        return failed("REPARSE_INTERRUPTED");
      const result = parseIntentResultSchema.safeParse(response);
      if (!result.success) return failed("PARSE_INVALID_RESPONSE");
      if (result.data.intent !== "create")
        return failed("REPARSE_UNSUPPORTED_INTENT");
      stage = "storage";
      committed = this.tasks.reparse(
        request.id,
        request.revision,
        request.mode,
        result.data.task,
      );
    } catch (error) {
      if (this.stopped) return failed("REPARSE_INTERRUPTED");
      if (error instanceof ParseClientError) {
        const code = taskReparseErrorSchema.safeParse(error.code);
        return failed(code.success ? code.data : "PARSE_UNAVAILABLE");
      }
      if (
        error instanceof Error &&
        (error.message === "CONCURRENT_EDIT" || error.message === "NOT_FOUND")
      )
        return failed(error.message);
      if (error instanceof ZodError)
        return failed(
          stage === "parse" ? "PARSE_INVALID_RESPONSE" : "INVALID_INPUT",
        );
      return failed(stage === "storage" ? "STORAGE_ERROR" : "UNKNOWN_ERROR");
    } finally {
      if (this.active.get(request.id) === token) this.active.delete(request.id);
    }
    // Committed fields must not become a failed parse because an effect throws.
    const { before, task } = committed;
    let warning: "REMINDER_SYNC_FAILED" | null = null;
    if (!this.stopped) {
      try {
        this.options.onTaskChanged?.(task);
      } catch {
        /* Reconcile again on the next query. */
      }
    }
    const dueChanged =
      before.dueDate !== task.dueDate ||
      before.dueTime !== task.dueTime ||
      before.timeZone !== task.timeZone;
    if (!this.stopped && (task.status !== "open" || dueChanged)) {
      try {
        this.options.syncTask?.(task.id);
      } catch {
        warning = "REMINDER_SYNC_FAILED";
      }
    }
    if (!this.stopped) {
      try {
        this.options.onChanged?.();
      } catch {
        /* A later query can confirm the commit. */
      }
    }
    return { kind: "updated", task, warning };
  }
}
