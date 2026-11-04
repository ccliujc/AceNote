import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  intakeSchema,
  rawTextSchema,
  type ErrorCode,
  type Intake,
} from "@acenote/contracts";
import { localDate } from "./local-date";

interface IntakeOptions {
  clock?: () => Date;
  idGenerator?: () => string;
  timeZone?: string;
}
interface IntakeRow {
  id: string;
  raw_text: string;
  received_at: string;
  local_date: string;
  local_date_time: string;
  time_zone: string;
  status: Intake["status"];
  intent: Intake["intent"];
  error: ErrorCode | null;
  created_at: string;
  updated_at: string;
  revision: number;
  completion_target: string | null;
  task_id: string | null;
  resolution_kind: Intake["resolutionKind"];
  legacy_unlinked: number;
}
type IntakePatch = Partial<
  Pick<
    Intake,
    | "status"
    | "intent"
    | "error"
    | "completionTarget"
    | "taskId"
    | "resolutionKind"
  >
>;

function toIntake(row: IntakeRow): Intake {
  return intakeSchema.parse({
    id: row.id,
    rawText: row.raw_text,
    receivedAt: row.received_at,
    localDate: row.local_date,
    localDateTime: row.local_date_time,
    timeZone: row.time_zone,
    status: row.status,
    intent: row.intent,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    completionTarget: row.completion_target,
    taskId: row.task_id,
    resolutionKind: row.resolution_kind,
    legacyUnlinked: Boolean(row.legacy_unlinked),
  });
}

export class IntakeRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly timeZone: string;
  constructor(
    private readonly database: Database.Database,
    options: IntakeOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.timeZone =
      options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }
  create(rawInput: string): Intake {
    const rawText = rawTextSchema.parse(rawInput);
    const id = this.idGenerator();
    const now = this.clock();
    const timestamp = now.toISOString();
    this.database
      .prepare(
        `INSERT INTO intake_events (
      id, raw_text, received_at, local_date, local_date_time, time_zone,
      status, intent, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        rawText,
        timestamp,
        localDate(now, this.timeZone),
        timestamp,
        this.timeZone,
        timestamp,
        timestamp,
      );
    return this.get(id);
  }
  get(id: string): Intake {
    const row = this.database
      .prepare("SELECT * FROM intake_events WHERE id = ?")
      .get(id) as IntakeRow | undefined;
    if (!row) throw new Error("NOT_FOUND");
    return toIntake(row);
  }
  listRecoverable(): Intake[] {
    return (
      this.database
        .prepare(
          "SELECT * FROM intake_events WHERE status != 'resolved' ORDER BY received_at DESC, id DESC",
        )
        .all() as IntakeRow[]
    ).map(toIntake);
  }
  countRecoverable(): number {
    return (
      this.database
        .prepare(
          "SELECT COUNT(*) AS count FROM intake_events WHERE status != 'resolved'",
        )
        .get() as { count: number }
    ).count;
  }
  update(id: string, expectedRevision: number, patch: IntakePatch): Intake {
    const names: Record<keyof IntakePatch, string> = {
      status: "status",
      intent: "intent",
      error: "error",
      completionTarget: "completion_target",
      taskId: "task_id",
      resolutionKind: "resolution_kind",
    };
    const entries = Object.entries(patch) as [
      keyof IntakePatch,
      string | null,
    ][];
    const assignments = entries.map(([key]) => `${names[key]} = ?`).join(", ");
    const result = this.database
      .prepare(
        `UPDATE intake_events SET ${assignments}, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`,
      )
      .run(
        ...entries.map(([, value]) => value),
        this.clock().toISOString(),
        id,
        expectedRevision,
      );
    if (!result.changes) {
      this.get(id);
      throw new Error("CONCURRENT_EDIT");
    }
    return this.get(id);
  }
  markPending(id: string, revision = this.get(id).revision): Intake {
    return this.update(id, revision, { status: "pending", error: null });
  }
  markAwaitingSelection(
    id: string,
    intent: "create" | "complete",
    completionTarget?: string,
    revision = this.get(id).revision,
  ): Intake {
    return this.update(id, revision, {
      status: "awaiting_selection",
      error: null,
      intent,
      ...(completionTarget === undefined ? {} : { completionTarget }),
    });
  }
  markFailed(
    id: string,
    error: ErrorCode,
    revision = this.get(id).revision,
  ): Intake {
    return this.update(id, revision, { status: "failed", error });
  }
  markResolved(
    id: string,
    intent: "create" | "complete",
    taskId?: string,
    resolutionKind?: Intake["resolutionKind"],
    revision = this.get(id).revision,
  ): Intake {
    return this.update(id, revision, {
      status: "resolved",
      error: null,
      intent,
      ...(taskId === undefined ? {} : { taskId }),
      ...(resolutionKind === undefined ? {} : { resolutionKind }),
    });
  }
}
