// Per-section notes: opt in with frontmatter `notes: true`. Notes live only in the reader's
// browser (localStorage), never in the page file. This module holds the pure key/export
// functions (unit-tested directly) plus the markup and inline script that use them; the script
// itself is plain JS duplicated from the pure functions below, since it has to run standalone in
// the page with no build step or import.

import { escapeAttr, escapeHtml } from "./util.ts";

export interface NoteHeading {
  slug: string;
  title: string;
}

export function noteStorageKey(pagePath: string, slug: string): string {
  return `mate-doc-note:${pagePath}:${slug}`;
}

// {slug: text}, nonempty notes only - matches `mate-doc walk submit --notes-file`'s expected
// shape.
export function exportNotesJson(notes: Record<string, string>): string {
  const trimmed: Record<string, string> = {};
  for (const [slug, text] of Object.entries(notes)) {
    const value = text.trim();
    if (value.length > 0) trimmed[slug] = value;
  }
  return JSON.stringify(trimmed, null, 2);
}

// "## Section" then the note text, one per heading with a nonempty note, in heading order.
export function exportNotesMarkdown(headings: NoteHeading[], notes: Record<string, string>): string {
  const parts: string[] = [];
  for (const h of headings) {
    const value = (notes[h.slug] ?? "").trim();
    if (value.length === 0) continue;
    parts.push(`## ${h.title}`, "", value, "");
  }
  return parts.join("\n").trimEnd();
}

// `hidden` by default, same convention as the tabs directive's non-first panel: a script-off
// reader never sees the control at all; the script below clears the attribute once it runs.
export function renderNoteControl(slug: string, title: string): string {
  return (
    `<div class="note-control" data-note-slug="${escapeAttr(slug)}" hidden>` +
    `<button type="button" class="note-toggle" aria-expanded="false">Add a note</button>` +
    `<textarea class="note-textarea" aria-label="${escapeAttr(`Notes for ${title}`)}" hidden></textarea>` +
    `</div>`
  );
}

export function renderNotesToolbar(): string {
  return (
    `<div class="notes-toolbar" hidden>` +
    `<p class="notes-count">Notes (0)</p>` +
    `<button type="button" class="notes-copy-btn" disabled>Copy notes</button>` +
    `<button type="button" class="notes-download-btn" disabled>Download notes JSON</button>` +
    `</div>`
  );
}

// A standalone JS mirror of noteStorageKey/exportNotesJson/exportNotesMarkdown: the page has no
// import system, so the logic is inlined here rather than shared at runtime with the functions
// above. Keep the two in sync by hand if the key or export format ever changes.
export function renderNotesScript(pagePath: string, headings: NoteHeading[]): string {
  const pagePathJson = JSON.stringify(pagePath);
  const headingsJson = JSON.stringify(headings);
  return `(function(){
  var pagePath = ${pagePathJson};
  var headings = ${headingsJson};
  function storageKey(slug) { return 'mate-doc-note:' + pagePath + ':' + slug; }
  var toolbar = document.querySelector('.notes-toolbar');
  if (toolbar) toolbar.hidden = false;
  var controls = document.querySelectorAll('.note-control');
  controls.forEach(function (control) {
    control.hidden = false;
    var slug = control.getAttribute('data-note-slug');
    var toggle = control.querySelector('.note-toggle');
    var textarea = control.querySelector('.note-textarea');
    var saved = '';
    try { saved = localStorage.getItem(storageKey(slug)) || ''; } catch (e) {}
    if (saved) {
      textarea.value = saved;
      textarea.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
    }
    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      textarea.hidden = expanded;
      if (!expanded) textarea.focus();
    });
    textarea.addEventListener('input', function () {
      try { localStorage.setItem(storageKey(slug), textarea.value); } catch (e) {}
      refresh();
    });
  });
  var copyBtn = document.querySelector('.notes-copy-btn');
  var downloadBtn = document.querySelector('.notes-download-btn');
  var countEl = document.querySelector('.notes-count');
  function refresh() {
    var n = Object.keys(collectNotes()).length;
    if (countEl) countEl.textContent = 'Notes (' + n + ')';
    if (copyBtn) copyBtn.disabled = n === 0;
    if (downloadBtn) downloadBtn.disabled = n === 0;
  }
  function collectNotes() {
    var notes = {};
    controls.forEach(function (control) {
      var slug = control.getAttribute('data-note-slug');
      var value = '';
      try { value = localStorage.getItem(storageKey(slug)) || ''; } catch (e) {}
      if (value.trim().length > 0) notes[slug] = value.trim();
    });
    return notes;
  }
  refresh();
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var notes = collectNotes();
      var parts = [];
      headings.forEach(function (h) {
        var value = notes[h.slug];
        if (value) parts.push('## ' + h.title, '', value, '');
      });
      var markdown = parts.join('\\n').replace(/\\n+$/, '');
      try { navigator.clipboard.writeText(markdown); } catch (e) {}
      copyBtn.textContent = 'Copied';
      setTimeout(function () { copyBtn.textContent = 'Copy notes'; }, 1500);
    });
  }
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      var notes = collectNotes();
      var blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'notes.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
})();`;
}
