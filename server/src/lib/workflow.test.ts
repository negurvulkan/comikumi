import { describe, it, expect } from "vitest";
import { getWorkflowEntry, WorkflowDocumentSchema, type PageWorkflow } from "../../../shared/src/workflow.js";

describe("getWorkflowEntry", () => {
  it("defaults to pending when the page has no workflow document at all", () => {
    expect(getWorkflowEntry(undefined, "cleaning")).toEqual({ status: "pending" });
    expect(getWorkflowEntry(undefined, "translation", "de")).toEqual({ status: "pending" });
  });

  it("defaults to pending when the page exists but the specific phase/language is missing", () => {
    const page: PageWorkflow = { languages: { de: { translation: { status: "approved" } } } };
    expect(getWorkflowEntry(page, "cleaning")).toEqual({ status: "pending" });
    expect(getWorkflowEntry(page, "lettering", "de")).toEqual({ status: "pending" });
    expect(getWorkflowEntry(page, "translation", "en")).toEqual({ status: "pending" });
  });

  it("returns the stored entry (status + assignee) when present", () => {
    const page: PageWorkflow = {
      cleaning: { status: "approved", assigneeUserId: "u1" },
      languages: { de: { translation: { status: "in_progress", assigneeUserId: "u2" } } },
    };
    expect(getWorkflowEntry(page, "cleaning")).toEqual({ status: "approved", assigneeUserId: "u1" });
    expect(getWorkflowEntry(page, "translation", "de")).toEqual({ status: "in_progress", assigneeUserId: "u2" });
  });
});

describe("WorkflowDocumentSchema", () => {
  it("parses an empty object into a document with no pages", () => {
    expect(WorkflowDocumentSchema.parse({})).toEqual({ pages: {} });
  });

  it("fills in missing status as pending and missing languages as {} on parse", () => {
    const parsed = WorkflowDocumentSchema.parse({ pages: { page_01: { cleaning: {} } } });
    expect(parsed.pages.page_01.cleaning?.status).toBe("pending");
    expect(parsed.pages.page_01.languages).toEqual({});
  });

  it("rejects an unknown status value", () => {
    const result = WorkflowDocumentSchema.safeParse({ pages: { page_01: { cleaning: { status: "done" } } } });
    expect(result.success).toBe(false);
  });
});
