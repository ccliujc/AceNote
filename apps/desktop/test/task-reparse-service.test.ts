import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParseIntentResult, TaskReparseRequest } from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { TaskRepository } from "../src/main/task-repository";
import { IntakeRepository } from "../src/main/intake-repository";
import { TaskReparseService } from "../src/main/task-reparse-service";
import { createIntentParser, ParseClientError } from "../src/main/parse-queue";
const fields = {
  title: "识别标题",
  dueDate: "2026-11-02",
  dueTime: "12:00",
  contact: "Sam",
};
const result: ParseIntentResult = { intent: "create", task: fields };
const requestId = "22222222-2222-4222-8222-222222222222";
let db: Database.Database, tasks: TaskRepository;
beforeEach(() => {
  db = createDatabase(":memory:");
  tasks = new TaskRepository(db, {
    clock: () => new Date("2026-11-01T15:30:00Z"),
    timeZone: "Asia/Shanghai",
  });
});
afterEach(() => {
  if (db.open) db.close();
  vi.unstubAllGlobals();
});
function operation(): TaskReparseRequest {
  const task = tasks.create("明天12点找Sam");
  return { id: task.id, revision: task.revision, mode: "replace" };
}
function pending() {
  let resolve!: (value: ParseIntentResult) => void;
  const parser = vi.fn(
    () =>
      new Promise<ParseIntentResult>((r) => {
        resolve = r;
      }),
  );
  return { parser, resolve: (value = result) => resolve(value) };
}
describe("existing task reparse service", () => {
  it("uses original context and a request identity distinct from the task without creating inputs", async () => {
    const op = operation();
    const inputs = new IntakeRepository(db);
    inputs.create("其他待处理输入");
    const rows = db.prepare("SELECT * FROM intake_events").all();
    const parser = vi.fn().mockResolvedValue(result);
    const service = new TaskReparseService(tasks, parser, {
      idGenerator: () => requestId,
    });
    expect((await service.reparseTask(op)).kind).toBe("updated");
    expect(parser).toHaveBeenCalledWith({
      requestId,
      rawText: "明天12点找Sam",
      localDateTime: "2026-11-01T15:30:00.000Z",
      timeZone: "Asia/Shanghai",
    });
    expect(tasks.list()).toHaveLength(1);
    expect(db.prepare("SELECT * FROM intake_events").all()).toEqual(rows);
  });
  it("rejects invalid saved time zones instead of substituting current time", async () => {
    const op = operation();
    db.prepare("UPDATE tasks SET time_zone = ? WHERE id = ?").run(
      "Invalid/Zone",
      op.id,
    );
    const before = tasks.get(op.id),
      parser = vi.fn();
    expect(await new TaskReparseService(tasks, parser).reparseTask(op)).toEqual(
      { kind: "failed", error: "INVALID_INPUT" },
    );
    expect(parser).not.toHaveBeenCalled();
    expect(tasks.get(op.id)).toEqual(before);
  });
  it("rejects invalid requests and stale initial revisions without model calls", async () => {
    const op = operation(),
      parser = vi.fn(),
      service = new TaskReparseService(tasks, parser);
    tasks.update(op.id, { title: "新编辑" }, op.revision);
    expect(await service.reparseTask(op)).toEqual({
      kind: "failed",
      error: "CONCURRENT_EDIT",
    });
    expect(await service.reparseTask({ ...op, revision: -1 })).toEqual({
      kind: "failed",
      error: "INVALID_INPUT",
    });
    expect(await service.reparseTask({ ...op, id: requestId })).toEqual({
      kind: "failed",
      error: "NOT_FOUND",
    });
    expect(parser).not.toHaveBeenCalled();
  });
  it("rejects duplicate modes while one operation owns the task and later releases the lock", async () => {
    const op = operation(),
      deferred = pending(),
      service = new TaskReparseService(tasks, deferred.parser);
    const first = service.reparseTask(op);
    expect(await service.reparseTask({ ...op, mode: "preserve" })).toEqual({
      kind: "failed",
      error: "REPARSE_BUSY",
    });
    expect(deferred.parser).toHaveBeenCalledTimes(1);
    deferred.resolve();
    expect((await first).kind).toBe("updated");
    expect(await service.reparseTask(op)).toEqual({
      kind: "failed",
      error: "CONCURRENT_EDIT",
    });
  });
  it("does not lock independent tasks", async () => {
    const op = operation();
    let resolve!: (value: ParseIntentResult) => void;
    const parser = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValue(result);
    const service = new TaskReparseService(tasks, parser),
      first = service.reparseTask(op);
    expect((await service.reparseTask(operation())).kind).toBe("updated");
    resolve(result);
    await first;
    expect(parser).toHaveBeenCalledTimes(2);
  });
  it.each(["edit", "complete", "archive", "restore", "parsed"] as const)(
    "rejects a late replacement after %s",
    async (kind) => {
      let op = operation();
      if (kind === "restore") {
        const archived = tasks.archive(op.id, op.revision);
        op = { ...op, revision: archived.revision };
      }
      const deferred = pending(),
        service = new TaskReparseService(tasks, deferred.parser),
        first = service.reparseTask(op);
      if (kind === "edit")
        tasks.update(op.id, { title: "并发编辑" }, op.revision);
      else if (kind === "parsed")
        tasks.applyParseResult(op.id, op.revision, {
          ...fields,
          title: "F01 提交",
        });
      else tasks[kind](op.id, op.revision);
      const current = tasks.get(op.id);
      deferred.resolve();
      expect(await first).toEqual({ kind: "failed", error: "CONCURRENT_EDIT" });
      expect(tasks.get(op.id)).toEqual(current);
    },
  );
  it.each([
    "NETWORK_ERROR",
    "PARSE_TIMEOUT",
    "PARSE_NOT_CONFIGURED",
    "PARSE_UNAVAILABLE",
  ] as const)("retains task and releases a failed %s request", async (code) => {
    const op = operation(),
      before = tasks.get(op.id);
    const parser = vi
      .fn()
      .mockRejectedValueOnce(new ParseClientError(code))
      .mockResolvedValueOnce(result);
    const changed = vi.fn(),
      service = new TaskReparseService(tasks, parser, { onChanged: changed });
    expect(await service.reparseTask(op)).toEqual({
      kind: "failed",
      error: code,
    });
    expect(tasks.get(op.id)).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    expect((await service.reparseTask(op)).kind).toBe("updated");
  });
  it.each([
    [
      { intent: "complete", completionTarget: "写周报" },
      "REPARSE_UNSUPPORTED_INTENT",
    ],
    [
      { intent: "create", task: { ...fields, dueTime: "99:00" } },
      "PARSE_INVALID_RESPONSE",
    ],
    [
      { intent: "create", task: { ...fields, status: "completed" } },
      "PARSE_INVALID_RESPONSE",
    ],
  ])(
    "does not consume completion or malformed results",
    async (response, error) => {
      const op = operation(),
        before = tasks.get(op.id),
        changed = vi.fn();
      expect(
        await new TaskReparseService(
          tasks,
          vi.fn().mockResolvedValue(response),
          { onChanged: changed },
        ).reparseTask(op),
      ).toEqual({ kind: "failed", error });
      expect(tasks.get(op.id)).toEqual(before);
      expect(changed).not.toHaveBeenCalled();
    },
  );
  it("maps a mismatched HTTP request and invalid body without leaking response text", async () => {
    const op = operation(),
      before = tasks.get(op.id);
    for (const body of [
      { requestId, result },
      { secret: "UPSTREAM PRIVATE" },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify(body), { status: 200 }),
          ),
      );
      expect(
        await new TaskReparseService(tasks, createIntentParser(), {
          idGenerator: () => op.id,
        }).reparseTask(op),
      ).toEqual({ kind: "failed", error: "PARSE_INVALID_RESPONSE" });
    }
    expect(tasks.get(op.id)).toEqual(before);
  });
  it("maps storage and unknown model errors safely", async () => {
    const op = operation();
    const service = new TaskReparseService(
      tasks,
      vi.fn().mockRejectedValue("SECRET"),
    );
    expect(await service.reparseTask(op)).toEqual({
      kind: "failed",
      error: "UNKNOWN_ERROR",
    });
    vi.spyOn(tasks, "reparse").mockImplementation(() => {
      throw new Error("SECRET SQL");
    });
    expect(
      await new TaskReparseService(
        tasks,
        vi.fn().mockResolvedValue(result),
      ).reparseTask(op),
    ).toEqual({ kind: "failed", error: "STORAGE_ERROR" });
    expect(tasks.get(op.id).revision).toBe(op.revision);
  });
  it("invalidates late callbacks before a closed database can be accessed", async () => {
    const op = operation(),
      deferred = pending(),
      changed = vi.fn(),
      service = new TaskReparseService(tasks, deferred.parser, {
        onChanged: changed,
      });
    const first = service.reparseTask(op);
    service.stop();
    service.stop();
    db.close();
    deferred.resolve();
    expect(await first).toEqual({
      kind: "failed",
      error: "REPARSE_INTERRUPTED",
    });
    expect(await service.reparseTask(op)).toEqual({
      kind: "failed",
      error: "REPARSE_INTERRUPTED",
    });
    expect(changed).not.toHaveBeenCalled();
  });
  it("keeps version 4 files and committed fields across restart without replay or permanent busy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "acenote-f03-restart-")),
      file = join(dir, "fixture.sqlite");
    let fileDb = createDatabase(file);
    try {
      const repo = new TaskRepository(fileDb),
        deferred = pending();
      const a = repo.create("未提交"),
        b = repo.create("已提交");
      const service = new TaskReparseService(
        repo,
        vi
          .fn()
          .mockImplementationOnce(deferred.parser)
          .mockResolvedValue(result),
      );
      const first = service.reparseTask({
        id: a.id,
        revision: 0,
        mode: "replace",
      });
      await service.reparseTask({ id: b.id, revision: 0, mode: "replace" });
      service.stop();
      fileDb.close();
      deferred.resolve();
      expect((await first).kind).toBe("failed");
      fileDb = createDatabase(file);
      const reopened = new TaskRepository(fileDb),
        parser = vi.fn().mockResolvedValue(result);
      const next = new TaskReparseService(reopened, parser);
      expect(parser).not.toHaveBeenCalled();
      expect(reopened.get(a.id)).toEqual(a);
      expect(reopened.get(b.id)).toMatchObject({
        ...fields,
        revision: 1,
        status: "open",
      });
      expect(
        fileDb
          .prepare("SELECT MAX(version) AS version FROM schema_migrations")
          .get(),
      ).toEqual({ version: 4 });
      expect(
        (await next.reparseTask({ id: a.id, revision: 0, mode: "preserve" }))
          .kind,
      ).toBe("updated");
    } finally {
      if (fileDb.open) fileDb.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
