import { z } from "zod";
import {
  completionCandidateSchema,
  intakeSchema,
  intakeStatusSchema,
} from "./lifecycle";

export const intakeOperationSchema = z
  .object({
    intakeId: z.uuid(),
    intakeRevision: z.number().int().nonnegative(),
  })
  .strict();

export const recoverableInputSchema = intakeSchema.extend({
  viewState: z.enum([
    "processing",
    "interrupted",
    "failed",
    "awaiting_selection",
  ]),
  canRetry: z.boolean(),
  canConvert: z.boolean(),
  canSelect: z.boolean(),
});
export const recoverableInputsSchema = z.array(recoverableInputSchema);
export const recoverySummarySchema = z.object({
  count: z.number().int().nonnegative(),
});
export const recoveryCandidatesSchema = intakeOperationSchema
  .extend({
    candidates: z.array(completionCandidateSchema),
    requiresReparse: z.boolean(),
  })
  .refine((value) => !value.requiresReparse || value.candidates.length === 0);
export const intakeChangedEventSchema = z
  .object({
    intakeId: z.uuid(),
    revision: z.number().int().nonnegative(),
    status: intakeStatusSchema,
  })
  .strict();

export type RecoverableInput = z.infer<typeof recoverableInputSchema>;
export type RecoverySummary = z.infer<typeof recoverySummarySchema>;
export type RecoveryCandidates = z.infer<typeof recoveryCandidatesSchema>;
export type IntakeChangedEvent = z.infer<typeof intakeChangedEventSchema>;

export interface RecoverySummaryApi {
  getRecoverableSummary(): Promise<RecoverySummary>;
  onInputsChanged(listener: (event: IntakeChangedEvent) => void): () => void;
}

export interface RecoveryApi extends RecoverySummaryApi {
  listInputs(): Promise<RecoverableInput[]>;
  getCandidates(
    intakeId: string,
    intakeRevision: number,
  ): Promise<RecoveryCandidates>;
  reparseCandidates(
    intakeId: string,
    intakeRevision: number,
  ): Promise<RecoveryCandidates>;
}
