import { describe, expect, test } from "bun:test";
import { renderNotesScript, renderNotesToolbar, renderNoteControl, exportNotesJson, exportNotesMarkdown, noteStorageKey } from "../../src/render/notes.ts";

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

describe("notes markup", () => {
  test("controls and toolbar start hidden, and the toolbar buttons start disabled with a count", () => {
    expect(renderNoteControl("a", "A")).toContain('data-note-slug="a" hidden');
    expect(renderNoteControl("a", "A")).toContain('aria-label="Notes for A" hidden');
    const toolbar = renderNotesToolbar();
    expect(toolbar).toContain('class="notes-toolbar" hidden');
    expect(toolbar).toContain("Notes (0)");
    expect(toolbar.match(/disabled/g)?.length).toBe(2);
  });

  test("the script updates the count, enables the buttons, and confirms a copy", () => {
    const script = renderNotesScript("p.md", [{ slug: "a", title: "A" }]);
    expect(script).toContain("'Notes (' + n + ')'");
    expect(script).toContain("copyBtn.disabled = n === 0");
    expect(script).toContain("'Copied'");
  });
});
