import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  errorCodeSchema,
  intakeSchema,
  rawTextSchema,
  type ErrorCode,
  type Intake,
  type IntakeStatus,
} from '@acenote/contracts';
import { localDate } from './local-date';

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
  status: IntakeStatus;
  intent: 'create' | 'complete' | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

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
    error: row.error ? errorCodeSchema.parse(row.error) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class IntakeRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly timeZone: string;

  constructor(private readonly database: Database.Database, options: IntakeOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  create(rawInput: string): Intake {
    const rawText = rawTextSchema.parse(rawInput);
    const id = this.idGenerator();
    const now = this.clock();
    const timestamp = now.toISOString();
    this.database.prepare(`
      INSERT INTO intake_events (
        id, raw_text, received_at, local_date, local_date_time, time_zone,
        status, intent, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)
    `).run(id, rawText, timestamp, localDate(now, this.timeZone), timestamp, this.timeZone, timestamp, timestamp);
    return this.get(id);
  }

  get(id: string): Intake {
    const row = this.database.prepare('SELECT * FROM intake_events WHERE id = ?').get(id) as IntakeRow | undefined;
    if (!row) throw new Error('NOT_FOUND');
    return toIntake(row);
  }

  listRecoverable(): Intake[] {
    return (this.database.prepare(
      "SELECT * FROM intake_events WHERE status IN ('pending', 'awaiting_selection', 'failed') ORDER BY created_at DESC",
    ).all() as IntakeRow[]).map(toIntake);
  }

  markPending(id: string): Intake {
    this.updateStatus(id, 'pending', null);
    return this.get(id);
  }

  markAwaitingSelection(id: string, intent: 'create' | 'complete'): Intake {
    this.updateStatus(id, 'awaiting_selection', null, intent);
    return this.get(id);
  }

  markFailed(id: string, error: ErrorCode): Intake {
    this.updateStatus(id, 'failed', error);
    return this.get(id);
  }

  markResolved(id: string, intent: 'create' | 'complete'): Intake {
    this.updateStatus(id, 'resolved', null, intent);
    return this.get(id);
  }

  private updateStatus(id: string, status: IntakeStatus, error: ErrorCode | null, intent: 'create' | 'complete' | null = null): void {
    const changed = this.database.prepare(`
      UPDATE intake_events SET status = ?, error = ?, intent = COALESCE(?, intent), updated_at = ?
      WHERE id = ?
    `).run(status, error, intent, this.clock().toISOString(), id);
    if (changed.changes === 0) throw new Error('NOT_FOUND');
  }
}
