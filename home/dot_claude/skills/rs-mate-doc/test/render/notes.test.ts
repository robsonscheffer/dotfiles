import { describe, expect, test } from "bun:test";
import { exportNotesJson, exportNotesMarkdown, noteStorageKey } from "../../src/render/notes.ts";

describe("noteStorageKey", () => {
  test("builds the mate-doc-note key from page path and slug", () => {
    expect(noteStorageKey("walk/pr-4242/index.md", "the-story")).toBe("mate-doc-note:walk/pr-4242/index.md:the-story");
  });
});

describe("exportNotesJson", () => {
  test("keeps only nonempty, trimmed notes", () => {
    const json = exportNotesJson({ a: "  keep this  ", b: "   ", c: "" });
    expect(JSON.parse(json)).toEqual({ a: "keep this" });
  });

  test("empty input yields an empty object", () => {
    expect(JSON.parse(exportNotesJson({}))).toEqual({});
  });
});

describe("exportNotesMarkdown", () => {
  test("emits '## Section' then the note text, in heading order, skipping empty notes", () => {
    const headings = [
      { slug: "first", title: "First" },
      { slug: "second", title: "Second" },
      { slug: "third", title: "Third" },
    ];
    const md = exportNotesMarkdown(headings, { first: "Note one.", third: "  Note three.  " });
    expect(md).toBe("## First\n\nNote one.\n\n## Third\n\nNote three.");
    expect(md).not.toContain("Second");
  });

  test("no notes at all yields an empty string", () => {
    expect(exportNotesMarkdown([{ slug: "a", title: "A" }], {})).toBe("");
  });
});
