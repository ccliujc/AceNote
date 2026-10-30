import { z } from 'zod';
import { reminderDueEventSchema } from './reminders';
import type {
  DailyCompletionSummary,
  LifecycleApi,
  LifecycleTask,
} from './lifecycle';

export const taskCompletedEventSchema = z.object({
  taskId: z.uuid(),
  title: z.string().min(1),
});

export const dataChangedEventSchema = z.object({
  reason: z.enum(['created', 'updated', 'completed', 'archived', 'restored']),
});

export const experienceEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task:completed'),
    payload: taskCompletedEventSchema,
  }),
  z.object({
    type: z.literal('data:changed'),
    payload: dataChangedEventSchema,
  }),
  z.object({
    type: z.literal('reminder:due'),
    payload: reminderDueEventSchema,
  }),
]);

export type TaskCompletedEvent = z.infer<typeof taskCompletedEventSchema>;
export type DataChangedEvent = z.infer<typeof dataChangedEventSchema>;
export type ExperienceEvent = z.infer<typeof experienceEventSchema>;

export interface ExperienceApi {
  onDataChanged: (listener: (event: DataChangedEvent) => void) => () => void;
  onTaskCompleted: (
    listener: (event: TaskCompletedEvent) => void,
  ) => () => void;
}

export interface QuickInputApi
  extends Pick<
    LifecycleApi,
    | 'submitInput'
    | 'retryInput'
    | 'convertInputToTask'
    | 'selectCandidate'
    | 'completeTask'
  > {
  listTasks: (date: string) => Promise<LifecycleTask[]>;
  getSummary: (date: string) => Promise<DailyCompletionSummary>;
  close: () => void;
  focusMain: () => void;
  onDataChanged: (listener: () => void) => () => void;
}

export interface PetApi extends ExperienceApi {
  openToday: () => Promise<void>;
  focusMain: () => Promise<void>;
  startDrag: (screenX: number, screenY: number) => void;
  dragTo: (screenX: number, screenY: number) => void;
  endDrag: () => void;
  setInteractive: (interactive: boolean) => void;
  onReminderDue: (
    listener: (event: z.infer<typeof reminderDueEventSchema>) => void,
  ) => () => void;
}
