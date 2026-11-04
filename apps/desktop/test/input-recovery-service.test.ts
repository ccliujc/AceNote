import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParseIntentResult } from "@acenote/contracts";
import { createDatabase } from "../src/main/database";
import { IntakeRepository } from "../src/main/intake-repository";
import { TaskRepository } from "../src/main/task-repository";
import { LifecycleService } from "../src/main/lifecycle-service";
import { ParseClientError } from "../src/main/parse-queue";

const create: ParseIntentResult = {
  intent: "create",
  task: {
    title: "吃饭",
    dueDate: "2026-11-01",
    dueTime: "12:00",
    contact: null,
  },
};
const complete: ParseIntentResult = {
  intent: "complete",
  completionTarget: "周报",
};
let db: Database.Database, inputs: IntakeRepository, tasks: TaskRepository;
let clock: Date;
beforeEach(() => {
  clock = new Date("2026-11-01T03:00:00Z");
  db = createDatabase(":memory:");
  inputs = new IntakeRepository(db, {
    clock: () => clock,
    timeZone: "Asia/Shanghai",
  });
  tasks = new TaskRepository(db, {
    clock: () => clock,
    timeZone: "Asia/Shanghai",
  });
});
afterEach(() => {
  if (db.open) db.close();
});
function gate() {
  let resolve!: (v: ParseIntentResult) => void;
  const promise = new Promise<ParseIntentResult>((r) => (resolve = r));
  return { promise, resolve };
}
function setup(parser = vi.fn().mockResolvedValue(create)) {
  const events = {
    onChanged: vi.fn(),
    onCompleted: vi.fn(),
    onInputChanged: vi.fn(),
  };
  return {
    parser,
    events,
    service: new LifecycleService(tasks, inputs, parser, undefined, events),
  };
}

describe("submitted input recovery service", () => {
  it("keeps a live operation busy across windows while other inputs can proceed", async () => {
    const pending = gate();
    const { service, parser } = setup(
      vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(create),
    );
    const first = service.submitInput("12点吃饭");
    const input = inputs.listRecoverable()[0]!;
    expect(service.listRecoverableInputs()[0]).toMatchObject({
      viewState: "processing",
      canRetry: false,
      canConvert: false,
    });
    service.recoverInterrupted();
    expect(inputs.get(input.id).status).toBe("pending");
    await expect(service.retryInput(input.id, input.revision)).rejects.toThrow(
      "INPUT_BUSY",
    );
    await expect(
      service.convertInputToTask(input.id, input.revision),
    ).rejects.toThrow("INPUT_BUSY");
    expect((await service.submitInput("另一条")).kind).toBe("task");
    pending.resolve(create);
    await first;
    expect(parser).toHaveBeenCalledTimes(2);
    expect(tasks.list()).toHaveLength(2);
    expect(service.getRecoverableSummary()).toEqual({ count: 0 });
  });
  it("converts once without AI and refuses resolved or stale requests", async () => {
    const { service, parser, events } = setup();
    const input = inputs.create("手工记录");
    const updated = inputs.markFailed(input.id, "NETWORK_ERROR");
    await expect(
      service.convertInputToTask(input.id, input.revision),
    ).rejects.toThrow("CONCURRENT_EDIT");
    const task = await service.convertInputToTask(input.id, updated.revision);
    expect(task).toMatchObject({
      id: input.id,
      title: "手工记录",
      recordedAt: input.receivedAt,
      dueDate: null,
    });
    await expect(
      service.convertInputToTask(input.id, updated.revision),
    ).rejects.toThrow("INPUT_ALREADY_RESOLVED");
    await expect(
      service.retryInput(input.id, updated.revision),
    ).rejects.toThrow("INPUT_ALREADY_RESOLVED");
    expect(tasks.list()).toHaveLength(1);
    expect(parser).not.toHaveBeenCalled();
    expect(events.onChanged).toHaveBeenCalledOnce();
  });
  it.each(["create", "convert", "complete", "select"] as const)(
    "rolls back %s together with its input on a terminal write failure",
    async (kind) => {
      const dir = mkdtempSync(join(tmpdir(), "acenote-f01-rollback-"));
      const filename = join(dir, "fault.sqlite");
      db.close();
      db = createDatabase(filename);
      inputs = new IntakeRepository(db);
      tasks = new TaskRepository(db);
      try {
        const parser = vi
          .fn()
          .mockResolvedValue(
            kind === "complete" || kind === "select" ? complete : create,
          );
        const { service, events } = setup(parser);
        let input = inputs.create("周报");
        const target =
          kind === "complete" || kind === "select"
            ? tasks.create("周报")
            : null;
        if (kind === "select")
          input = inputs.markAwaitingSelection(input.id, "complete", "周报");
        const original = inputs.update.bind(inputs);
        vi.spyOn(inputs, "update").mockImplementation((id, rev, patch) => {
          if (patch.status === "resolved") throw new Error("terminal failure");
          return original(id, rev, patch);
        });
        if (kind === "convert")
          await expect(
            service.convertInputToTask(input.id, input.revision),
          ).rejects.toThrow("terminal failure");
        else if (kind === "select")
          await expect(
            service.selectCandidate({
              intakeId: input.id,
              intakeRevision: input.revision,
              taskId: target!.id,
              revision: target!.revision,
            }),
          ).rejects.toThrow("terminal failure");
        else
          expect(
            (await service.retryInput(input.id, input.revision)).kind,
          ).toBe("failed");
        expect(inputs.get(input.id).status).not.toBe("resolved");
        if (target) expect(tasks.get(target.id).status).toBe("open");
        else expect(tasks.list()).toHaveLength(0);
        expect(events.onCompleted).not.toHaveBeenCalled();
        expect(events.onChanged).not.toHaveBeenCalled();
        db.close();
        db = createDatabase(filename);
        expect(new IntakeRepository(db).get(input.id).status).not.toBe(
          "resolved",
        );
        const persisted = new TaskRepository(db).list();
        expect(persisted).toHaveLength(target ? 1 : 0);
        if (target) expect(persisted[0]!.status).toBe("open");
      } finally {
        if (db.open) db.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
  it.each(["convert", "select"] as const)(
    "allows only one concurrent %s result across window clients",
    async (kind) => {
      const { service, parser, events } = setup();
      let input = inputs.create("周报完成");
      const target = kind === "select" ? tasks.create("周报") : null;
      if (target)
        input = inputs.markAwaitingSelection(input.id, "complete", "周报");
      const operation = () =>
        target
          ? service.selectCandidate({
              intakeId: input.id,
              intakeRevision: input.revision,
              taskId: target.id,
              revision: target.revision,
            })
          : service.convertInputToTask(input.id, input.revision);
      const results = await Promise.allSettled([operation(), operation()]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.reason.message).toBe("INPUT_ALREADY_RESOLVED");
      expect(tasks.list()).toHaveLength(1);
      expect(events.onChanged).toHaveBeenCalledOnce();
      expect(events.onCompleted).toHaveBeenCalledTimes(target ? 1 : 0);
      expect(parser).not.toHaveBeenCalled();
      expect(inputs.get(input.id).status).toBe("resolved");
    },
  );
  it("does not let a late response overwrite a newer input version", async () => {
    const pending = gate();
    const { service } = setup(vi.fn().mockReturnValue(pending.promise));
    const action = service.submitInput("原文");
    const input = inputs.listRecoverable()[0]!;
    const newer = inputs.markFailed(input.id, "NETWORK_ERROR");
    pending.resolve(create);
    await expect(action).rejects.toThrow("CONCURRENT_EDIT");
    expect(inputs.get(input.id)).toMatchObject({
      revision: newer.revision,
      error: "NETWORK_ERROR",
    });
    expect(tasks.list()).toHaveLength(0);
  });
  it("protects a linked task edited while parsing and preserves already edited legacy tasks", async () => {
    const input = inputs.create("12点吃饭");
    let task = tasks.create(input.rawText, { id: input.id });
    const pending = gate();
    const { service, parser } = setup(vi.fn().mockReturnValue(pending.promise));
    const action = service.retryInput(input.id, input.revision);
    task = tasks.update(task.id, { title: "我的手动标题" }, task.revision);
    pending.resolve(create);
    expect(await action).toMatchObject({
      kind: "failed",
      error: "CONCURRENT_EDIT",
    });
    expect(tasks.get(task.id).title).toBe("我的手动标题");
    service.recoverInterrupted();
    expect(inputs.get(input.id)).toMatchObject({
      status: "resolved",
      taskId: task.id,
    });
    expect(parser).toHaveBeenCalledOnce();
  });
  it("recomputes saved targets offline and confirms even a single remaining candidate", async () => {
    const first = tasks.create("周报"),
      second = tasks.create("周报"),
      outside = tasks.create("吃饭");
    const { service, parser, events } = setup(
      vi.fn().mockResolvedValue(complete),
    );
    const result = await service.submitInput("周报完成了");
    expect(result.kind).toBe("selection_required");
    tasks.archive(second.id, second.revision);
    const candidates = service.getRecoveryCandidates(
      result.intakeId,
      result.intakeRevision,
    );
    expect(candidates.candidates).toHaveLength(1);
    expect(tasks.get(first.id).status).toBe("open");
    await expect(
      service.selectCandidate({
        intakeId: result.intakeId,
        intakeRevision: result.intakeRevision,
        taskId: outside.id,
        revision: outside.revision,
      }),
    ).rejects.toThrow("CONCURRENT_EDIT");
    await service.selectCandidate({
      intakeId: result.intakeId,
      intakeRevision: result.intakeRevision,
      taskId: first.id,
      revision: first.revision,
    });
    await expect(
      service.selectCandidate({
        intakeId: result.intakeId,
        intakeRevision: result.intakeRevision,
        taskId: first.id,
        revision: first.revision,
      }),
    ).rejects.toThrow("INPUT_ALREADY_RESOLVED");
    expect(parser).toHaveBeenCalledOnce();
    expect(events.onCompleted).toHaveBeenCalledOnce();
  });
  it("retains a cancelled selection and rejects a changed candidate version or membership", async () => {
    const a = tasks.create("周报"),
      b = tasks.create("周报");
    const { service } = setup(vi.fn().mockResolvedValue(complete));
    const result = await service.submitInput("周报完成");
    service.getRecoveryCandidates(result.intakeId, result.intakeRevision);
    expect(inputs.get(result.intakeId).status).toBe("awaiting_selection");
    const changed = tasks.update(a.id, { title: "其他任务" }, a.revision);
    await expect(
      service.selectCandidate({
        intakeId: result.intakeId,
        intakeRevision: result.intakeRevision,
        taskId: a.id,
        revision: a.revision,
      }),
    ).rejects.toThrow("CONCURRENT_EDIT");
    tasks.complete(b.id, b.revision);
    tasks.archive(changed.id, changed.revision);
    expect(
      service.getRecoveryCandidates(result.intakeId, result.intakeRevision)
        .candidates,
    ).toEqual([]);
    expect(inputs.get(result.intakeId).status).toBe("awaiting_selection");
  });
  it("explicitly reparses legacy selection targets without automatically completing or creating", async () => {
    const { service, parser } = setup(
      vi
        .fn()
        .mockResolvedValueOnce(create)
        .mockRejectedValueOnce(new ParseClientError("NETWORK_ERROR"))
        .mockResolvedValue(complete),
    );
    let input = inputs.create("周报完成了");
    input = inputs.markAwaitingSelection(input.id, "complete");
    tasks.create("周报");
    expect(
      service.getRecoveryCandidates(input.id, input.revision).requiresReparse,
    ).toBe(true);
    expect(parser).not.toHaveBeenCalled();
    await expect(
      service.reparseRecoveryCandidates(input.id, input.revision),
    ).rejects.toThrow("PARSE_INVALID_RESPONSE");
    input = inputs.get(input.id);
    await expect(
      service.reparseRecoveryCandidates(input.id, input.revision),
    ).rejects.toThrow("NETWORK_ERROR");
    input = inputs.get(input.id);
    const result = await service.reparseRecoveryCandidates(
      input.id,
      input.revision,
    );
    expect(result).toMatchObject({
      requiresReparse: false,
      candidates: [{ title: "周报" }],
    });
    expect(tasks.list()[0]!.status).toBe("open");
    expect(inputs.get(input.id).status).toBe("awaiting_selection");
    await expect(
      service.reparseRecoveryCandidates(input.id, result.intakeRevision),
    ).rejects.toThrow("INVALID_TRANSITION");
    await expect(
      service.retryInput(input.id, result.intakeRevision),
    ).rejects.toThrow("INVALID_TRANSITION");
  });
  it("recovers interrupted records across a file reopen, preserves receive context and never replays committed results", async () => {
    const dir = mkdtempSync(join(tmpdir(), "acenote-f01-reopen-"));
    try {
      const filename = join(dir, "test.sqlite");
      db.close();
      db = createDatabase(filename);
      inputs = new IntakeRepository(db, {
        clock: () => clock,
        timeZone: "Asia/Shanghai",
      });
      tasks = new TaskRepository(db, { clock: () => clock });
      const input = inputs.create("12点吃饭");
      db.close();
      clock = new Date("2026-11-02T18:00:00Z");
      db = createDatabase(filename);
      inputs = new IntakeRepository(db, {
        clock: () => clock,
        timeZone: "America/Los_Angeles",
      });
      tasks = new TaskRepository(db, { clock: () => clock });
      const { service, parser } = setup();
      service.recoverInterrupted();
      expect(service.listRecoverableInputs()[0]).toMatchObject({
        viewState: "interrupted",
        localDate: "2026-11-01",
      });
      expect(parser).not.toHaveBeenCalled();
      const result = await service.retryInput(
        input.id,
        inputs.get(input.id).revision,
      );
      expect(parser.mock.calls[0]![0]).toMatchObject({
        localDateTime: input.receivedAt,
        timeZone: "Asia/Shanghai",
      });
      expect(result).toMatchObject({
        kind: "task",
        task: { recordDate: "2026-11-01" },
      });
      db.close();
      db = createDatabase(filename);
      const reopenedInputs = new IntakeRepository(db);
      const parser2 = vi.fn();
      const reopened = new LifecycleService(
        new TaskRepository(db),
        reopenedInputs,
        parser2,
      );
      reopened.recoverInterrupted();
      expect(reopened.listRecoverableInputs()).toEqual([]);
      await expect(reopened.retryInput(input.id, 0)).rejects.toThrow(
        "INPUT_ALREADY_RESOLVED",
      );
      expect(parser2).not.toHaveBeenCalled();
    } finally {
      if (db.open) db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("ignores late writes after shutdown even after the database has closed", async () => {
    const pending = gate();
    const { service } = setup(vi.fn().mockReturnValue(pending.promise));
    const action = service.submitInput("中断");
    service.stop();
    db.close();
    pending.resolve(create);
    await expect(action).rejects.toThrow("INPUT_INTERRUPTED");
    await expect(service.submitInput("退出后")).rejects.toThrow(
      "INPUT_INTERRUPTED",
    );
  });
  it("keeps committed results despite renderer delivery failures", async () => {
    const broken = () => {
      throw new Error("renderer gone");
    };
    const service = new LifecycleService(
      tasks,
      inputs,
      vi.fn().mockResolvedValue(create),
      { syncTask: broken },
      { onChanged: broken, onCompleted: broken, onInputChanged: broken },
    );
    const result = await service.submitInput("记录");
    expect(result.kind).toBe("task");
    expect(inputs.get(result.intakeId).status).toBe("resolved");
    const target = tasks.create("周报");
    await service.completeTask(target.id, target.revision);
    expect(tasks.get(target.id).status).toBe("completed");
  });
});
