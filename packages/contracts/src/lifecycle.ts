import { z } from 'zod';
import {
  dueDateSchema,
  errorCodeSchema,
  parsedTaskSchema,
  rawTextSchema,
  taskSchema,
} from './capture';

export const TASK_STATUSES = ['open', 'completed', 'archived'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskStatusFilterSchema = z.enum([...TASK_STATUSES, 'all']);

export const lifecycleTaskSchema = taskSchema.extend({
  status: taskStatusSchema,
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  completionDate: dueDateSchema.nullable(),
  completionTimeZone: z.string().min(1).nullable(),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const createIntentSchema = z.object({
  intent: z.literal('create'),
  task: parsedTaskSchema,
}).strict();

export const completeIntentSchema = z.object({
  intent: z.literal('complete'),
  completionTarget: z.string().trim().min(1).max(200),
}).strict();

export const parseIntentResultSchema = z.discriminatedUnion('intent', [
  createIntentSchema,
  completeIntentSchema,
]);

export const parseIntentResponseSchema = z.object({
  requestId: z.uuid(),
  result: parseIntentResultSchema,
});

export const completionCandidateSchema = lifecycleTaskSchema.pick({
  id: true,
  title: true,
  recordDate: true,
  contact: true,
  revision: true,
});

export const INTAKE_STATUSES = ['pending', 'awaiting_selection', 'resolved', 'failed'] as const;
export const intakeStatusSchema = z.enum(INTAKE_STATUSES);

export const intakeSchema = z.object({
  id: z.uuid(),
  rawText: rawTextSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  localDate: dueDateSchema,
  localDateTime: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1),
  status: intakeStatusSchema,
  intent: z.enum(['create', 'complete']).nullable(),
  error: errorCodeSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const dailyCompletionSummarySchema = z.object({
  date: dueDateSchema,
  completedCount: z.number().int().nonnegative(),
});

export const lifecycleQuerySchema = z.object({
  date: dueDateSchema,
  status: taskStatusFilterSchema.default('all'),
});

export const inputOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), intakeId: z.uuid(), task: lifecycleTaskSchema }),
  z.object({ kind: z.literal('completed'), intakeId: z.uuid(), task: lifecycleTaskSchema }),
  z.object({
    kind: z.literal('selection_required'),
    intakeId: z.uuid(),
    candidates: z.array(completionCandidateSchema).min(2),
  }),
  z.object({ kind: z.literal('no_match'), intakeId: z.uuid(), message: z.string() }),
  z.object({
    kind: z.literal('failed'),
    intakeId: z.uuid(),
    error: errorCodeSchema,
    message: z.string(),
  }),
]);

export const archiveTaskSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
});

export const restoreTaskSchema = archiveTaskSchema;

export const selectCandidateSchema = z.object({
  intakeId: z.uuid(),
  taskId: z.uuid(),
  revision: z.number().int().nonnegative(),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskStatusFilter = z.infer<typeof taskStatusFilterSchema>;
export type LifecycleTask = z.infer<typeof lifecycleTaskSchema>;
export type ParseIntentResult = z.infer<typeof parseIntentResultSchema>;
export type ParseIntentResponse = z.infer<typeof parseIntentResponseSchema>;
export type CompletionCandidate = z.infer<typeof completionCandidateSchema>;
export type IntakeStatus = z.infer<typeof intakeStatusSchema>;
export type Intake = z.infer<typeof intakeSchema>;
export type DailyCompletionSummary = z.infer<typeof dailyCompletionSummarySchema>;
export type InputOutcome = z.infer<typeof inputOutcomeSchema>;

export interface EditorApi {
  updateTask: (id: string, patch: import('./capture').TaskPatch, revision: number) => Promise<LifecycleTask>;
}

export interface LifecycleApi {
  submitInput(rawText: string): Promise<InputOutcome>;
  retryInput(intakeId: string): Promise<InputOutcome>;
  convertInputToTask(intakeId: string): Promise<LifecycleTask>;
  listTasks(date: string, status: TaskStatusFilter): Promise<LifecycleTask[]>;
  getDailySummary(date: string): Promise<DailyCompletionSummary>;
  selectCandidate(input: z.infer<typeof selectCandidateSchema>): Promise<LifecycleTask>;
  archiveTask(id: string, revision: number): Promise<LifecycleTask>;
  restoreTask(id: string, revision: number): Promise<LifecycleTask>;
}
