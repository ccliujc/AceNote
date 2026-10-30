import {
  selectCandidateSchema,
  type DailyCompletionSummary,
  type InputOutcome,
  type LifecycleTask,
  type ParseIntentResult,
  type TaskStatusFilter,
} from '@acenote/contracts';
import { ParseClientError, type IntentClient } from './parse-queue';
import type { TaskRepository } from './task-repository';
import type { IntakeRepository } from './intake-repository';
import { findCompletionCandidates } from './completion-matcher';
import type { Intake } from '@acenote/contracts';

export interface LifecycleEvents {
  onChanged: (
    reason: 'created' | 'updated' | 'completed' | 'archived' | 'restored',
  ) => void;
  onCompleted: (task: LifecycleTask) => void;
}

export class LifecycleService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly intakes: IntakeRepository,
    private readonly intentClient: IntentClient,
    private readonly reminders?: { syncTask: (taskId: string) => void },
    private readonly events?: LifecycleEvents,
  ) {}

  async submitInput(rawText: string): Promise<InputOutcome> {
    const intake = this.intakes.create(rawText);
    return this.process(intake);
  }

  async retryInput(intakeId: string): Promise<InputOutcome> {
    const intake = this.intakes.markPending(intakeId);
    return this.process(intake);
  }

  async convertInputToTask(intakeId: string): Promise<LifecycleTask> {
    const intake = this.intakes.get(intakeId);
    const task = this.tasks.create(intake.rawText, {
      recordedAt: new Date(intake.receivedAt),
      timeZone: intake.timeZone,
    });
    this.tasks.applyParseResult(task.id, 0, {
      title: intake.rawText.slice(0, 200),
      dueDate: null,
      dueTime: null,
      contact: null,
    });
    this.intakes.markResolved(intake.id, 'create');
    this.syncReminder(task.id);
    this.events?.onChanged('created');
    return this.tasks.get(task.id);
  }

  async selectCandidate(input: {
    intakeId: string;
    taskId: string;
    revision: number;
  }): Promise<LifecycleTask> {
    const value = selectCandidateSchema.parse(input);
    this.intakes.get(value.intakeId);
    const task = this.tasks.complete(value.taskId, value.revision);
    this.intakes.markResolved(value.intakeId, 'complete');
    this.syncReminder(task.id);
    this.events?.onCompleted(task);
    this.events?.onChanged('completed');
    return task;
  }

  async archiveTask(id: string, revision: number): Promise<LifecycleTask> {
    const task = this.tasks.archive(id, revision);
    this.syncReminder(task.id);
    this.events?.onChanged('archived');
    return task;
  }

  async completeTask(id: string, revision: number): Promise<LifecycleTask> {
    const task = this.tasks.complete(id, revision);
    this.syncReminder(task.id);
    this.events?.onCompleted(task);
    this.events?.onChanged('completed');
    return task;
  }

  async restoreTask(id: string, revision: number): Promise<LifecycleTask> {
    const task = this.tasks.restore(id, revision);
    this.syncReminder(task.id);
    this.events?.onChanged('restored');
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

  private async process(intake: Intake): Promise<InputOutcome> {
    let intent: ParseIntentResult;
    try {
      intent = await this.intentClient({
        requestId: intake.id,
        rawText: intake.rawText,
        localDateTime: intake.localDateTime,
        timeZone: intake.timeZone,
      });
    } catch (error) {
      const code =
        error instanceof ParseClientError ? error.code : 'UNKNOWN_ERROR';
      this.intakes.markFailed(intake.id, code);
      return {
        kind: 'failed',
        intakeId: intake.id,
        error: code,
        message: '未能理解这条输入，原文已保存，可重试。',
      };
    }

    if (intent.intent === 'create') {
      const existing = this.findTask(intake.id);
      if (existing) {
        this.intakes.markResolved(intake.id, 'create');
        return { kind: 'task', intakeId: intake.id, task: existing };
      }
      const task = this.tasks.create(intake.rawText, {
        id: intake.id,
        recordedAt: new Date(intake.receivedAt),
        timeZone: intake.timeZone,
      });
      this.tasks.applyParseResult(task.id, 0, intent.task);
      this.intakes.markResolved(intake.id, 'create');
      this.syncReminder(task.id);
      this.events?.onChanged('created');
      return {
        kind: 'task',
        intakeId: intake.id,
        task: this.tasks.get(task.id),
      };
    }

    const candidates = findCompletionCandidates(
      intent.completionTarget,
      this.tasks.list(),
    );
    if (candidates.length === 1) {
      const task = this.tasks.complete(
        candidates[0]!.id,
        candidates[0]!.revision,
      );
      this.intakes.markResolved(intake.id, 'complete');
      this.syncReminder(task.id);
      this.events?.onCompleted(task);
      this.events?.onChanged('completed');
      return { kind: 'completed', intakeId: intake.id, task };
    }
    if (candidates.length > 1) {
      this.intakes.markAwaitingSelection(intake.id, 'complete');
      return { kind: 'selection_required', intakeId: intake.id, candidates };
    }
    this.intakes.markFailed(intake.id, 'NO_MATCH');
    return {
      kind: 'no_match',
      intakeId: intake.id,
      message: '没有找到对应的未完成事项，请重新描述或作为新待办保存。',
    };
  }

  private syncReminder(taskId: string): void {
    try {
      this.reminders?.syncTask(taskId);
    } catch {
      // Task state changes remain successful; startup reconciliation repairs reminders.
    }
  }

  private findTask(id: string): LifecycleTask | null {
    try {
      return this.tasks.get(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return null;
      throw error;
    }
  }
}
