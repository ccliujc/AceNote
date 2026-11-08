import { describe, expect, it } from "vitest";
import { parsedTaskSchema } from "@acenote/contracts";
import { mergeReparseFields } from "../src/main/task-reparse-fields";
const before = {
  title: "原文回退标题",
  dueDate: null,
  dueTime: null,
  contact: null,
};
const result = {
  title: "新标题",
  dueDate: "2026-11-02",
  dueTime: "12:00",
  contact: "Sam",
};
describe("reparse field merge", () => {
  it("preserves nonempty values without requiring an edit marker", () => {
    const full = { ...result, title: "手动标题", contact: "已有对接人" };
    expect(
      mergeReparseFields(full, { ...before, title: "替代" }, "preserve"),
    ).toEqual(full);
    expect(mergeReparseFields(before, result, "preserve")).toEqual({
      ...result,
      title: before.title,
    });
  });
  it("treats cleared optional fields as gaps and adopts an entire date pair", () => {
    const merged = mergeReparseFields(before, result, "preserve");
    expect(merged.contact).toBe("Sam");
    expect(parsedTaskSchema.parse(merged)).toEqual(merged);
    expect(
      mergeReparseFields(before, { ...before, title: "新" }, "preserve"),
    ).toEqual(before);
  });
  it("fills a time only for the same retained date", () => {
    const dated = { ...before, dueDate: result.dueDate };
    expect(mergeReparseFields(dated, result, "preserve").dueTime).toBe("12:00");
    for (const dueDate of ["2026-11-03", null]) {
      const input = {
        ...result,
        dueDate,
        dueTime: dueDate ? result.dueTime : null,
      };
      expect(mergeReparseFields(dated, input, "preserve")).toEqual({
        ...dated,
        contact: "Sam",
      });
    }
  });
  it("retains an existing time and replaces all four fields only when requested", () => {
    const current = { ...result, dueTime: "08:00" };
    expect(mergeReparseFields(current, result, "preserve")).toEqual(current);
    expect(mergeReparseFields(current, before, "replace")).toEqual(before);
    expect(mergeReparseFields(before, result, "replace")).toEqual(result);
  });
  it("rejects invalid current or proposed pairs rather than partially repairing", () => {
    expect(() =>
      mergeReparseFields({ ...before, dueTime: "12:00" }, result, "preserve"),
    ).toThrow();
    expect(() =>
      mergeReparseFields(before, { ...result, dueDate: null }, "preserve"),
    ).toThrow();
    expect(() =>
      mergeReparseFields(before, { ...result, title: "" }, "replace"),
    ).toThrow();
  });
});
