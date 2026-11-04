import { describe, expect, it } from "vitest";
import {
  intakeSchema,
  inputOutcomeSchema,
  selectCandidateSchema,
  intakeOperationSchema,
  recoveryCandidatesSchema,
  recoverableInputSchema,
  recoverySummarySchema,
  intakeChangedEventSchema,
} from "../src";

const id = "11111111-1111-4111-8111-111111111111";
const legacy = {
  id,
  rawText: "写周报",
  receivedAt: "2026-11-01T01:00:00Z",
  localDate: "2026-11-01",
  localDateTime: "2026-11-01T01:00:00Z",
  timeZone: "Asia/Shanghai",
  status: "failed",
  intent: null,
  error: "NETWORK_ERROR",
  createdAt: "2026-11-01T01:00:00Z",
  updatedAt: "2026-11-01T01:00:00Z",
};
const candidate = {
  id,
  title: "写周报",
  recordDate: "2026-11-01",
  contact: null,
  revision: 3,
};

describe("submitted input recovery contracts", () => {
  it("reads old metadata as empty values and validates new recovery views", () => {
    expect(intakeSchema.parse(legacy)).toMatchObject({
      revision: 0,
      completionTarget: null,
      taskId: null,
      resolutionKind: null,
      legacyUnlinked: false,
    });
    expect(
      recoverableInputSchema.parse({
        ...legacy,
        revision: 4,
        viewState: "interrupted",
        canRetry: true,
        canConvert: true,
        canSelect: false,
      }).revision,
    ).toBe(4);
    expect(intakeSchema.safeParse({ ...legacy, taskId: "bad" }).success).toBe(
      false,
    );
    expect(recoverySummarySchema.safeParse({ count: -1 }).success).toBe(false);
  });
  it("allows zero or one recovery candidate without loosening ordinary selection", () => {
    for (const candidates of [[], [candidate], [candidate, candidate]])
      expect(
        recoveryCandidatesSchema.parse({
          intakeId: id,
          intakeRevision: 4,
          candidates,
          requiresReparse: false,
        }).candidates,
      ).toEqual(candidates);
    expect(
      recoveryCandidatesSchema.safeParse({
        intakeId: id,
        intakeRevision: 4,
        candidates: [candidate],
        requiresReparse: true,
      }).success,
    ).toBe(false);
    expect(
      inputOutcomeSchema.safeParse({
        kind: "selection_required",
        intakeId: id,
        intakeRevision: 4,
        candidates: [candidate],
      }).success,
    ).toBe(false);
  });
  it("requires an input version separately from the task version", () => {
    for (const version of [undefined, -1, 0.5, "1", Infinity]) {
      expect(
        intakeOperationSchema.safeParse({
          intakeId: id,
          intakeRevision: version,
        }).success,
      ).toBe(false);
      expect(
        selectCandidateSchema.safeParse({
          intakeId: id,
          taskId: id,
          revision: 3,
          intakeRevision: version,
        }).success,
      ).toBe(false);
    }
    expect(
      selectCandidateSchema.parse({
        intakeId: id,
        intakeRevision: 5,
        taskId: id,
        revision: 3,
      }),
    ).toMatchObject({ intakeRevision: 5, revision: 3 });
    expect(
      inputOutcomeSchema.safeParse({
        kind: "failed",
        intakeId: id,
        error: "INPUT_INTERRUPTED",
        message: "中断",
      }).success,
    ).toBe(false);
    expect(
      inputOutcomeSchema.parse({
        kind: "failed",
        intakeId: id,
        intakeRevision: 2,
        error: "INPUT_BUSY",
        message: "处理中",
      }).intakeRevision,
    ).toBe(2);
    expect(
      intakeChangedEventSchema.safeParse({
        intakeId: id,
        revision: 1,
        status: "failed",
        rawText: "private",
      }).success,
    ).toBe(false);
  });
});
