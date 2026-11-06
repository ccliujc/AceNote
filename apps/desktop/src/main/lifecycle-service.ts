import {
  intakeOperationSchema,
  parseIntentResultSchema,
  selectCandidateSchema,
  type DailyCompletionSummary,
  type ErrorCode,
  type InputOutcome,
  type Intake,
  type IntakeChangedEvent,
  type LifecycleTask,
  type ParsedTask,
  type RecoverableInput,
  type RecoveryCandidates,
  type TaskStatusFilter,
} from "@acenote/contracts";
import { ParseClientError, type IntentClient } from "./parse-queue";
import type { TaskRepository } from "./task-repository";
import type { IntakeRepository } from "./intake-repository";
import { findCompletionCandidates } from "./completion-matcher";

export interface LifecycleEvents {
  onChanged: (
    reason: "created" | "updated" | "completed" | "archived" | "restored",
  ) => void;
  onCompleted: (task: LifecycleTask) => void;
  onTaskChanged?: (task: LifecycleTask) => void;
  onInputChanged?: (event: IntakeChangedEvent) => void;
}
interface Operation {
  token: symbol;
  revision: number;
  taskRevision: number | null;
}

export class LifecycleService {
  private readonly active = new Map<string, Operation>();
  private stopped = false;
  constructor(
    private readonly tasks: TaskRepository,
    private readonly intakes: IntakeRepository,
    private readonly intentClient: IntentClient,
    private readonly reminders?: { syncTask: (taskId: string) => void },
    private readonly events?: LifecycleEvents,
  ) {}

  stop(): void {
    this.stopped = true;
    this.active.clear();
  }

  recoverInterrupted(): void {
    for (const input of this.intakes.listRecoverable()) {
      if (this.active.has(input.id)) continue;
      const task = this.linkedTask(input);
      if (
        task &&
        (task.parseStatus === "succeeded" ||
          task.editedAt ||
          task.status !== "open")
      ) {
        this.intakes.transaction(() =>
          this.intakes.markResolved(
            input.id,
            "create",
            task.id,
            "created",
            input.revision,
          ),
        );
      } else if (input.status === "pending") {
        this.intakes.markFailed(input.id, "INPUT_INTERRUPTED", input.revision);
      }
    }
  }

  listRecoverableInputs(): RecoverableInput[] {
    return this.intakes.listRecoverable().map((input) => {
      const busy = this.active.has(input.id);
      return {
        ...input,
        viewState: busy
          ? "processing"
          : input.status === "awaiting_selection"
            ? "awaiting_selection"
            : input.error === "INPUT_INTERRUPTED" || input.status === "pending"
              ? "interrupted"
              : "failed",
        canRetry: !busy && input.status !== "awaiting_selection",
        canConvert: !busy,
        canSelect: !busy && input.status === "awaiting_selection",
      };
    });
  }
  getRecoverableSummary(): { count: number } {
    return { count: this.intakes.countRecoverable() };
  }

  async submitInput(rawText: string): Promise<InputOutcome> {
    if (this.stopped) throw new Error("INPUT_INTERRUPTED");
    const input = this.intakes.create(rawText);
    return this.parseInput(input.id, input.revision);
  }
  async retryInput(
    intakeId: string,
    intakeRevision: number,
  ): Promise<InputOutcome> {
    const input = this.available(intakeId, intakeRevision);
    if (input.status === "awaiting_selection")
      throw new Error("INVALID_TRANSITION");
    return this.parseInput(intakeId, intakeRevision);
  }
  async convertInputToTask(
    intakeId: string,
    intakeRevision: number,
  ): Promise<LifecycleTask> {
    const input = this.available(intakeId, intakeRevision);
    const op = this.acquire(input);
    try {
      return this.commitCreated(
        input,
        op,
        {
          title: input.rawText.slice(0, 200),
          dueDate: null,
          dueTime: null,
          contact: null,
        },
        "converted",
      ).task;
    } finally {
      this.release(input.id, op);
    }
  }

  getRecoveryCandidates(
    intakeId: string,
    intakeRevision: number,
  ): RecoveryCandidates {
    const input = this.available(intakeId, intakeRevision);
    if (input.status !== "awaiting_selection")
      throw new Error("INVALID_TRANSITION");
    return this.candidates(input);
  }
  async reparseRecoveryCandidates(
    intakeId: string,
    intakeRevision: number,
  ): Promise<RecoveryCandidates> {
    const input = this.available(intakeId, intakeRevision);
    if (input.status !== "awaiting_selection" || input.completionTarget)
      throw new Error("INVALID_TRANSITION");
    const op = this.acquire(input);
    try {
      const pending = this.intakes.update(input.id, op.revision, {
        error: null,
      });
      op.revision = pending.revision;
      this.inputChanged(input.id);
      try {
        const intent = parseIntentResultSchema.parse(
          await this.intentClient(this.request(input)),
        );
        this.checkActive(input.id, op);
        if (intent.intent !== "complete")
          throw new ParseClientError("PARSE_INVALID_RESPONSE");
        const updated = this.intakes.markAwaitingSelection(
          input.id,
          "complete",
          intent.completionTarget,
          op.revision,
        );
        return this.candidates(updated);
      } catch (error) {
        this.checkActive(input.id, op);
        this.intakes.update(input.id, op.revision, {
          error: this.errorCode(error),
        });
        throw error;
      }
    } finally {
      this.release(input.id, op);
    }
  }
  async selectCandidate(input: {
    intakeId: string;
    intakeRevision: number;
    taskId: string;
    revision: number;
  }): Promise<LifecycleTask> {
    const value = selectCandidateSchema.parse(input);
    const intake = this.available(value.intakeId, value.intakeRevision);
    if (intake.status !== "awaiting_selection" || !intake.completionTarget)
      throw new Error("INVALID_TRANSITION");
    const op = this.acquire(intake);
    try {
      const task = this.intakes.transaction(() => {
        this.checkActive(intake.id, op);
        const candidate = findCompletionCandidates(
          intake.completionTarget!,
          this.tasks.list(),
        ).find((item) => item.id === value.taskId);
        if (!candidate || candidate.revision !== value.revision)
          throw new Error("CONCURRENT_EDIT");
        const completed = this.tasks.complete(value.taskId, value.revision);
        this.intakes.markResolved(
          intake.id,
          "complete",
          completed.id,
          "completed",
          op.revision,
        );
        return completed;
      });
      this.taskChanged(task, "completed");
      return task;
    } finally {
      this.release(intake.id, op);
    }
  }

  async archiveTask(id: string, revision: number): Promise<LifecycleTask> {
    const task = this.tasks.archive(id, revision);
    this.taskChanged(task, "archived");
    return task;
  }
  async completeTask(id: string, revision: number): Promise<LifecycleTask> {
    const task = this.tasks.complete(id, revision);
    this.taskChanged(task, "completed");
    return task;
  }
  async restoreTask(id: string, revision: number): Promise<LifecycleTask> {
    const task = this.tasks.restore(id, revision);
    this.taskChanged(task, "restored");
    return task;
  }
  async listTasks(
    date: string,
    status: TaskStatusFilter,
  ): Promise<LifecycleTask[]> {
    return this.tasks.listByRecordDate(date, status);
  }
  async getDailySummary(date: string): Promise<DailyCompletionSummary> {
    return this.tasks.dailyCompletionSummary(date);
  }

  private available(id: string, revision: number): Intake {
    intakeOperationSchema.parse({ intakeId: id, intakeRevision: revision });
    if (this.stopped) throw new Error("INPUT_INTERRUPTED");
    const input = this.intakes.get(id);
    if (input.status === "resolved") throw new Error("INPUT_ALREADY_RESOLVED");
    if (this.active.has(id)) throw new Error("INPUT_BUSY");
    if (input.revision !== revision) throw new Error("CONCURRENT_EDIT");
    return input;
  }
  private acquire(input: Intake): Operation {
    const op = {
      token: Symbol(),
      revision: input.revision,
      taskRevision: this.linkedTask(input)?.revision ?? null,
    };
    this.active.set(input.id, op);
    return op;
  }
  private checkActive(id: string, op: Operation): void {
    if (this.stopped) throw new Error("INPUT_INTERRUPTED");
    if (this.active.get(id)?.token !== op.token)
      throw new Error("CONCURRENT_EDIT");
    const current = this.intakes.get(id);
    if (current.status === "resolved")
      throw new Error("INPUT_ALREADY_RESOLVED");
    if (current.revision !== op.revision) throw new Error("CONCURRENT_EDIT");
  }
  private release(id: string, op: Operation): void {
    if (this.active.get(id)?.token === op.token) this.active.delete(id);
    if (!this.stopped) this.inputChanged(id);
  }
  private request(input: Intake) {
    return {
      requestId: input.id,
      rawText: input.rawText,
      localDateTime: input.localDateTime,
      timeZone: input.timeZone,
    };
  }
  private async parseInput(
    id: string,
    revision: number,
  ): Promise<InputOutcome> {
    const input = this.available(id, revision);
    const op = this.acquire(input);
    try {
      const existing = this.linkedTask(input);
      if (
        existing &&
        (existing.editedAt ||
          existing.parseStatus === "succeeded" ||
          existing.status !== "open")
      ) {
        const resolved = this.intakes.transaction(() =>
          this.intakes.markResolved(
            input.id,
            "create",
            existing.id,
            "created",
            op.revision,
          ),
        );
        return {
          kind: "task",
          intakeId: id,
          intakeRevision: resolved.revision,
          task: existing,
        };
      }
      const pending = this.intakes.markPending(id, op.revision);
      op.revision = pending.revision;
      this.inputChanged(id);
      try {
        const intent = parseIntentResultSchema.parse(
          await this.intentClient(this.request(input)),
        );
        this.checkActive(id, op);
        if (intent.intent === "create") {
          const result = this.commitCreated(input, op, intent.task, "created");
          return {
            kind: "task",
            intakeId: id,
            intakeRevision: result.revision,
            task: result.task,
          };
        }
        const candidates = findCompletionCandidates(
          intent.completionTarget,
          this.tasks.list(),
        );
        if (candidates.length === 1) {
          const result = this.intakes.transaction(() => {
            this.checkActive(id, op);
            const task = this.tasks.complete(
              candidates[0]!.id,
              candidates[0]!.revision,
            );
            const resolved = this.intakes.update(id, op.revision, {
              status: "resolved",
              error: null,
              intent: "complete",
              completionTarget: intent.completionTarget,
              taskId: task.id,
              resolutionKind: "completed",
            });
            return { task, revision: resolved.revision };
          });
          this.taskChanged(result.task, "completed");
          return {
            kind: "completed",
            intakeId: id,
            intakeRevision: result.revision,
            task: result.task,
          };
        }
        const updated = this.intakes.update(id, op.revision, {
          status: candidates.length ? "awaiting_selection" : "failed",
          intent: "complete",
          completionTarget: intent.completionTarget,
          error: candidates.length ? null : "NO_MATCH",
        });
        if (candidates.length > 1)
          return {
            kind: "selection_required",
            intakeId: id,
            intakeRevision: updated.revision,
            candidates,
          };
        return {
          kind: "no_match",
          intakeId: id,
          intakeRevision: updated.revision,
          message: "没有找到对应的未完成事项，请重新描述或作为新待办保存。",
        };
      } catch (error) {
        this.checkActive(id, op);
        const code = this.errorCode(error);
        const failed = this.intakes.markFailed(id, code, op.revision);
        return {
          kind: "failed",
          intakeId: id,
          intakeRevision: failed.revision,
          error: code,
          message: "未能处理这条输入，原文已保存，可重试。",
        };
      }
    } finally {
      this.release(id, op);
    }
  }
  private commitCreated(
    input: Intake,
    op: Operation,
    fields: ParsedTask,
    kind: "created" | "converted",
  ) {
    const result = this.intakes.transaction(() => {
      this.checkActive(input.id, op);
      let task = this.linkedTask(input);
      if (task && task.revision !== op.taskRevision)
        throw new Error("CONCURRENT_EDIT");
      if (!task)
        task = this.tasks.create(input.rawText, {
          id: input.id,
          recordedAt: new Date(input.receivedAt),
          timeZone: input.timeZone,
        });
      if (
        !task.editedAt &&
        task.status === "open" &&
        task.parseStatus !== "succeeded"
      ) {
        const updated = this.tasks.applyParseResult(
          task.id,
          task.revision,
          fields,
        );
        if (!updated) throw new Error("CONCURRENT_EDIT");
        task = updated;
      }
      const resolved = this.intakes.markResolved(
        input.id,
        "create",
        task.id,
        kind,
        op.revision,
      );
      return { task, revision: resolved.revision };
    });
    this.taskChanged(result.task, "created");
    return result;
  }
  private candidates(input: Intake): RecoveryCandidates {
    return {
      intakeId: input.id,
      intakeRevision: input.revision,
      requiresReparse: !input.completionTarget,
      candidates: input.completionTarget
        ? findCompletionCandidates(input.completionTarget, this.tasks.list())
        : [],
    };
  }
  private linkedTask(input: Intake): LifecycleTask | null {
    try {
      return this.tasks.get(input.taskId ?? input.id);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") return null;
      throw error;
    }
  }
  private errorCode(error: unknown): ErrorCode {
    if (error instanceof ParseClientError) return error.code;
    if (error instanceof Error && error.message === "CONCURRENT_EDIT")
      return "CONCURRENT_EDIT";
    return "UNKNOWN_ERROR";
  }
  private safe(effect: () => void): void {
    try {
      effect();
    } catch {
      /* Committed data must survive delivery failures. */
    }
  }
  private inputChanged(id: string): void {
    this.safe(() => {
      const input = this.intakes.get(id);
      this.events?.onInputChanged?.({
        intakeId: id,
        revision: input.revision,
        status: input.status,
      });
    });
  }
  private taskChanged(
    task: LifecycleTask,
    reason: "created" | "completed" | "archived" | "restored",
  ): void {
    this.safe(() => this.events?.onTaskChanged?.(task));
    this.safe(() => this.reminders?.syncTask(task.id));
    if (reason === "completed") this.safe(() => this.events?.onCompleted(task));
    this.safe(() => this.events?.onChanged(reason));
  }
}
