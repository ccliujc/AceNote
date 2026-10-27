import {
  errorCodeSchema,
  parseResponseSchema,
  type ErrorCode,
  type ParsedTask,
  type ParseRequest,
  type ReparseMode,
} from '@acenote/contracts';
import type { TaskRepository } from './task-repository';

export type ParseClient = (request: ParseRequest) => Promise<ParsedTask>;

export class ParseClientError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export function createHttpParser(serverUrl = process.env.ACENOTE_PARSE_URL ?? 'http://127.0.0.1:3777'): ParseClient {
  return async (request) => {
    let response: Response;
    try {
      response = await fetch(`${serverUrl}/v1/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(21000),
      });
    } catch {
      throw new ParseClientError('NETWORK_ERROR');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { code?: unknown } | null;
      const code = errorCodeSchema.catch('PARSE_UNAVAILABLE').parse(body?.code);
      throw new ParseClientError(code);
    }
    const parsed = parseResponseSchema.parse(await response.json());
    if (parsed.requestId !== request.requestId) throw new ParseClientError('PARSE_INVALID_RESPONSE');
    return parsed.result;
  };
}

interface ParseQueueOptions {
  clock?: () => Date;
}

export class ParseQueue {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly clock: () => Date;

  constructor(private readonly repository: TaskRepository, private readonly parser: ParseClient, options: ParseQueueOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
  }

  enqueue(id: string, revision: number, mode: ReparseMode = 'replace'): void {
    if (this.inFlight.has(id)) return;
    const pending = this.run(id, revision, mode).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, pending);
  }

  resume(): void {
    for (const task of this.repository.list()) {
      if (task.parseStatus === 'pending' || task.parseStatus === 'failed') {
        this.repository.setParseStatus(task.id, 'pending');
        this.enqueue(task.id, task.revision, 'preserve');
      }
    }
  }

  async idle(): Promise<void> {
    await Promise.all(this.inFlight.values());
  }

  private async run(id: string, revision: number, mode: ReparseMode): Promise<void> {
    try {
      const task = this.repository.get(id);
      if (task.revision !== revision) return;
      this.repository.setParseStatus(id, 'processing');
      const result = await this.parser({
        requestId: task.id,
        rawText: task.rawText,
        localDateTime: this.clock().toISOString(),
        timeZone: task.timeZone,
      });
      const current = this.repository.get(id);
      const merged = mode === 'preserve' && current.editedAt
        ? {
            title: current.title,
            dueDate: current.dueDate ?? result.dueDate,
            dueTime: current.dueDate ? current.dueTime : result.dueTime,
            contact: current.contact ?? result.contact,
          }
        : result;
      const applied = this.repository.applyParseResult(id, revision, merged);
      if (!applied) this.repository.setParseStatus(id, 'failed', 'CONCURRENT_EDIT');
    } catch (error) {
      const code = error instanceof ParseClientError ? error.code : 'UNKNOWN_ERROR';
      this.repository.setParseStatus(id, 'failed', code);
    }
  }
}
