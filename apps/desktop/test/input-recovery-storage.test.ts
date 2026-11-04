import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../src/main/database";
import { IntakeRepository } from "../src/main/intake-repository";
import { TaskRepository } from "../src/main/task-repository";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((p) => rmSync(p, { recursive: true, force: true })),
);
const stamp = new Date("2026-11-01T01:00:00Z");
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

describe("input recovery persistence", () => {
  it("queries all dates deterministically, excludes resolved and rejects stale updates", () => {
    const db = createDatabase(":memory:");
    try {
      let n = 0;
      const inputs = new IntakeRepository(db, {
        clock: () => stamp,
        idGenerator: () => ids[n++]!,
        timeZone: "Asia/Shanghai",
      });
      const a = inputs.create("第一条"),
        b = inputs.create("第二条"),
        c = inputs.create("第三条");
      inputs.markResolved(c.id, "create");
      const failed = inputs.markFailed(a.id, "NETWORK_ERROR", a.revision);
      expect(inputs.listRecoverable().map((i) => i.id)).toEqual([b.id, a.id]);
      expect(inputs.countRecoverable()).toBe(2);
      expect(() => inputs.markPending(a.id, a.revision)).toThrow(
        "CONCURRENT_EDIT",
      );
      expect(inputs.get(a.id)).toMatchObject({
        revision: failed.revision,
        rawText: "第一条",
        receivedAt: stamp.toISOString(),
      });
      expect(() =>
        inputs.markFailed(
          ids[2]!.replace("3333-4333", "3333-4334"),
          "NETWORK_ERROR",
        ),
      ).toThrow("NOT_FOUND");
    } finally {
      db.close();
    }
  });
  it("rolls back task and input writes together and enforces result foreign keys", () => {
    const db = createDatabase(":memory:");
    try {
      const inputs = new IntakeRepository(db, { clock: () => stamp });
      const tasks = new TaskRepository(db);
      const intake = inputs.create("事务原文");
      expect(() =>
        inputs.transaction(() => {
          tasks.create(intake.rawText, { id: intake.id });
          inputs.markResolved(intake.id, "create", intake.id, "created");
          throw new Error("injected before commit");
        }),
      ).toThrow("injected");
      expect(tasks.list()).toEqual([]);
      expect(inputs.get(intake.id)).toMatchObject({
        status: "pending",
        revision: 0,
        taskId: null,
      });
      expect(() => inputs.update(intake.id, 0, { taskId: ids[0] })).toThrow();
      expect(inputs.get(intake.id).revision).toBe(0);
    } finally {
      db.close();
    }
  });
  it("upgrades version 3 without guessing matching text and preserves records on reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "acenote-recovery-"));
    directories.push(dir);
    const filename = join(dir, "legacy.sqlite");
    const old = new Database(filename);
    old.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    for (const [index, name] of [
      "001-create-tasks.sql",
      "002-task-lifecycle.sql",
      "003-reminders.sql",
    ].entries()) {
      old.exec(
        readFileSync(
          new URL("../src/main/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
      old
        .prepare("INSERT INTO schema_migrations VALUES (?,?)")
        .run(index + 1, stamp.toISOString());
    }
    const insert = old.prepare(
      `INSERT INTO intake_events VALUES (?,?,?,?,?,?,?,NULL,NULL,?,?)`,
    );
    ids.forEach((id, i) =>
      insert.run(
        id,
        "相同原文",
        stamp.toISOString(),
        "2026-11-01",
        stamp.toISOString(),
        "Asia/Shanghai",
        i === 2 ? "resolved" : "failed",
        stamp.toISOString(),
        stamp.toISOString(),
      ),
    );
    old
      .prepare(
        `INSERT INTO tasks (id,raw_text,title,recorded_at,record_date,time_zone,parse_status,created_at,updated_at,edited_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        ids[0],
        "相同原文",
        "手动标题",
        stamp.toISOString(),
        "2026-11-01",
        "Asia/Shanghai",
        "succeeded",
        stamp.toISOString(),
        stamp.toISOString(),
        stamp.toISOString(),
        7,
      );
    old.close();
    const upgraded = createDatabase(filename);
    const inputs = new IntakeRepository(upgraded);
    expect(inputs.get(ids[0]!)).toMatchObject({
      taskId: ids[0],
      legacyUnlinked: false,
      revision: 0,
    });
    expect(inputs.get(ids[1]!)).toMatchObject({
      taskId: null,
      legacyUnlinked: true,
    });
    expect(inputs.get(ids[2]!)).toMatchObject({
      status: "resolved",
      taskId: null,
      legacyUnlinked: false,
    });
    expect(new TaskRepository(upgraded).get(ids[0]!)).toMatchObject({
      title: "手动标题",
      revision: 7,
    });
    upgraded.close();
    const reopened = createDatabase(filename);
    expect(
      reopened.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 4 });
    expect(new IntakeRepository(reopened).get(ids[1]!).rawText).toBe(
      "相同原文",
    );
    reopened.close();
  });
});
