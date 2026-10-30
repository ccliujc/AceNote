import { z } from 'zod';

export const PARSE_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
export const parseStatusSchema = z.enum(PARSE_STATUSES);
export const dueDateSchema = z.iso.date();
export const dueTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'STORAGE_ERROR',
  'NETWORK_ERROR',
  'PARSE_TIMEOUT',
  'PARSE_UNAVAILABLE',
  'PARSE_INVALID_RESPONSE',
  'PARSE_NOT_CONFIGURED',
  'CONCURRENT_EDIT',
  'INVALID_TRANSITION',
  'NO_MATCH',
  'MULTIPLE_MATCHES',
  'UNKNOWN_ERROR',
]);

export const rawTextSchema = z.string().trim().min(1).max(2000);
export const parsedTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueDate: dueDateSchema.nullable(),
    dueTime: dueTimeSchema.nullable(),
    contact: z.string().trim().min(1).max(100).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueTime && !value.dueDate) {
      context.addIssue({ code: 'custom', message: 'dueTime requires dueDate' });
    }
  });

export const taskSchema = z.object({
  id: z.uuid(),
  rawText: rawTextSchema,
  title: z.string().trim().min(1).max(200),
  recordedAt: z.iso.datetime({ offset: true }),
  recordDate: dueDateSchema,
  dueDate: dueDateSchema.nullable(),
  dueTime: dueTimeSchema.nullable(),
  timeZone: z.string().min(1),
  contact: z.string().trim().min(1).max(100).nullable(),
  parseStatus: parseStatusSchema,
  parseError: errorCodeSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  editedAt: z.iso.datetime({ offset: true }).nullable(),
  revision: z.number().int().nonnegative(),
});

export const parseRequestSchema = z.object({
  requestId: z.uuid(),
  rawText: rawTextSchema,
  localDateTime: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1),
});

export const parseResponseSchema = z.object({
  requestId: z.uuid(),
  result: parsedTaskSchema,
});

export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    dueDate: dueDateSchema.nullable().optional(),
    dueTime: dueTimeSchema.nullable().optional(),
    contact: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();

export const reparseModeSchema = z.enum(['preserve', 'replace']);

export type ParseStatus = z.infer<typeof parseStatusSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ParsedTask = z.infer<typeof parsedTaskSchema>;
export type Task = z.infer<typeof taskSchema>;
export type ParseRequest = z.infer<typeof parseRequestSchema>;
export type ParseResponse = z.infer<typeof parseResponseSchema>;
export type TaskPatch = z.infer<typeof taskPatchSchema>;
export type ReparseMode = z.infer<typeof reparseModeSchema>;

export interface AceNoteApi {
  submitTask(rawText: string): Promise<Task>;
  listTasks(): Promise<Task[]>;
  updateTask(id: string, patch: TaskPatch, revision: number): Promise<Task>;
  retryParse(id: string): Promise<Task>;
  reparseTask(id: string, mode: ReparseMode): Promise<Task>;
}
