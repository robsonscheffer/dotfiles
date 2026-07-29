#!/usr/bin/env python3
"""rs-walk build-walk — assembles walk.html + meta.json from structured agent
output (Step 4's four JSON schemas) plus a PR diff.

This is a deterministic transcription of SKILL.md Step 5 into code, so every
walk gets byte-identical structure regardless of which agent run built it.

rs-walk owns its own template (assets/walk-template.html) — it does not
borrow and patch html-artifact's report.html. It still depends on
html-artifact for the compiled mate-ds stylesheet (inlined at build time
below, same as html-artifact's own singlefile build does) and the lint
binary, but the walk document's structure, header, and layout are rs-walk's
own and can evolve independently.

Usage:
  build-walk.py \
    --pr-meta /tmp/walk-N-meta.json \
    --diff /tmp/walk-N.diff \
    --story /tmp/walk-N-story.json \
    --questions /tmp/walk-N-questions.json \
    --risks /tmp/walk-N-risks.json \
    --judgment /tmp/walk-N-judgment.json \
    --context /tmp/walk-N-context.json \
    --repo org/repo \
    --extra-sections /tmp/walk-N-extra.json \
    [--render-diff-bin path/to/render-diff.sh] \
    [--template path/to/walk-template.html] \
    [--main-css path/to/main.css] \
    [--lint-bin path/to/lint-artifact.mjs] \
    [--tags "PROJ-1234,topic-a,topic-b"] \
    [--out-root ~/brain/wiki/walks] \
    [--back-link ../index.html] \
    [--force]

Inputs:
  --pr-meta     JSON: {number, title, author:{login}, headRefName, baseRefName,
                       additions, deletions, changedFiles, url}
  --story       JSON: {story, groups:[{title, framing, files:[...], note?}]}
  --questions   JSON: [{title, question, pointer}]
  --risks       JSON: [{title, description, blast_radius, file}]
  --judgment    JSON: {fit, risks_summary:[...], gaps:[...], overall}
  --context     JSON: {mode:"qmd"|"grep", items:[...]}
                 qmd items: [{path, score, snippet}]
                 grep items: ["path", ...]
                 empty items -> renders the standard "nothing found" fallback
  --extra-sections  optional JSON: [{title, body}] — supplementary content
                 sections (e.g. answering a side question the user asked
                 alongside the PR URL) inserted after "The story" and before
                 the diff groups. Omit if there's nothing supplementary.

Writes <out-root>/pr-<number>-<slug>/walk.html and meta.json. Prints the
walk directory path to stdout on success.
"""
import argparse
import json
import os
import re
import subprocess
import sys

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RENDER_DIFF = os.path.join(SKILL_DIR, "bin", "render-diff.sh")
DEFAULT_TEMPLATE = os.path.join(SKILL_DIR, "assets", "walk-template.html")
DEFAULT_MAIN_CSS = os.path.expanduser("~/.claude/skills/html-artifact/dist/style/main.css")
DEFAULT_LINT_BIN = os.path.expanduser("~/.claude/skills/html-artifact/bin/lint-artifact.mjs")
DEFAULT_OUT_ROOT = os.path.expanduser("~/brain/wiki/walks")
DEFAULT_BACK_LINK = "../index.html"

BADGE_CLASS_BY_OVERALL = {
    "strong": ("badge-done", ""),
    "solid": ("badge-building", ""),
    "cautious": ("badge-open", ' style="background:var(--mate-warning);color:#000;"'),
    "concern": ("badge-open", ' style="background:var(--mate-error);color:#fff;"'),
}


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def read_json(path):
    with open(path) as f:
        return json.load(f)


def read_text(path):
    with open(path) as f:
        return f.read()


def slugify(title):
    s = title.lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = s.replace(" ", "-")[:40]
    return s.rstrip("-")


def extract_tags(title, extra_tags):
    tags = re.findall(r"[A-Z]+-\d+", title)
    if extra_tags:
        tags.extend(t.strip() for t in extra_tags.split(",") if t.strip())
    seen = []
    for t in tags:
        if t not in seen:
            seen.append(t)
    return seen


def render_diff_block(filepath, diff_file, render_diff_bin, max_lines=80):
    result = subprocess.run(
        ["bash", render_diff_bin, diff_file, filepath, str(max_lines)],
        capture_output=True, text=True, check=True,
    )
    inner = result.stdout
    basename = os.path.basename(filepath)
    dirname = os.path.dirname(filepath)
    return f"""
<details open class="diff-block" style="margin-bottom:1.25rem;">
  <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" title="{esc(filepath)}">
    <div class="diff-file-header" style="flex:1;margin:0;border-radius:0;border-bottom:none;display:flex;align-items:center;gap:0.5rem;">
      <span class="diff-toggle-icon" style="font-size:11px;color:var(--mate-frame-dim);display:inline-block;">&#x25BC;</span>
      <span style="font-family:var(--mate-font-mono);font-size:14px;">{esc(basename)}</span>
      <span style="font-size:14px;color:var(--mate-frame-dim);font-family:var(--mate-font-mono);margin-left:auto;opacity:0.5;">{esc(dirname)}/</span>
    </div>
  </summary>
  {inner}
</details>
"""


TOGGLE_JS = """
<script>
  (function () {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("details.diff-block").forEach((d) => {
        d.addEventListener("toggle", function () {
          const icon = this.querySelector(".diff-toggle-icon");
          if (icon) icon.style.transform = this.open ? "rotate(0deg)" : "rotate(-90deg)";
        });
      });
    });
    window.__walkToggleAll = function () {
      const blocks = document.querySelectorAll("details.diff-block");
      const btn = document.getElementById("walk-toggle-all");
      const anyOpen = Array.from(blocks).some((d) => d.open);
      blocks.forEach((d) => { d.open = !anyOpen; });
      if (btn) btn.textContent = anyOpen ? "expand all" : "collapse all";
    };
  })();
</script>
"""

EXPAND_CONTROLS = """
<div style="margin-bottom:1rem;">
  <button id="walk-toggle-all" onclick="__walkToggleAll()" style="font-size:14px;font-family:var(--mate-font-body);color:var(--mate-frame-muted);background:var(--mate-frame-sidebar);border:1px solid var(--mate-frame-border);border-radius:4px;padding:0.2rem 0.6rem;cursor:pointer;">collapse all</button>
</div>
"""


def render_context_section(context):
    mode = context.get("mode", "grep")
    items = context.get("items", [])
    if not items:
        body = '<p style="color:var(--mate-frame-text);font-size:14px;">Nothing found in brain for this area — first walk in this territory.</p>'
    elif mode == "qmd":
        lis = "".join(
            f'<li style="font-size:14px;margin-bottom:0.4rem;">[{esc(it.get("score", ""))}%] {esc(it.get("path", ""))}: {esc(it.get("snippet", ""))}</li>'
            for it in items
        )
        body = f'<ul style="padding-left:1.2rem;">{lis}</ul>'
    else:
        lis = "".join(f'<li style="font-size:14px;margin-bottom:0.4rem;">{esc(it)}</li>' for it in items)
        body = f'<ul style="padding-left:1.2rem;">{lis}</ul>'
    return f"""
<section style="margin-bottom:2rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">Context</h2>
  {body}
</section>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pr-meta", required=True)
    ap.add_argument("--diff", required=True)
    ap.add_argument("--story", required=True)
    ap.add_argument("--questions", required=True)
    ap.add_argument("--risks", required=True)
    ap.add_argument("--judgment", required=True)
    ap.add_argument("--context", required=True)
    ap.add_argument("--repo", required=True)
    ap.add_argument("--extra-sections", default=None)
    ap.add_argument("--render-diff-bin", default=DEFAULT_RENDER_DIFF)
    ap.add_argument("--template", default=DEFAULT_TEMPLATE)
    ap.add_argument("--main-css", default=DEFAULT_MAIN_CSS)
    ap.add_argument("--lint-bin", default=DEFAULT_LINT_BIN)
    ap.add_argument("--tags", default="")
    ap.add_argument("--out-root", default=DEFAULT_OUT_ROOT)
    ap.add_argument("--back-link", default=DEFAULT_BACK_LINK)
    ap.add_argument("--force", action="store_true", help="overwrite an existing walk dir")
    args = ap.parse_args()

    pr_meta = read_json(args.pr_meta)
    story_data = read_json(args.story)
    questions_data = read_json(args.questions)
    risks_data = read_json(args.risks)
    judgment_data = read_json(args.judgment)
    context = read_json(args.context)
    extra_sections = read_json(args.extra_sections) if args.extra_sections else []

    number = pr_meta["number"]
    title = pr_meta["title"]
    author = pr_meta["author"]["login"]
    head_ref = pr_meta["headRefName"]
    url = pr_meta["url"]
    additions = pr_meta["additions"]
    deletions = pr_meta["deletions"]
    changed_files = pr_meta["changedFiles"]
    context_mode = context.get("mode", "grep")
    today = os.environ.get("WALK_TODAY")
    if not today:
        print("ERROR: set WALK_TODAY=YYYY-MM-DD in the environment (agents cannot compute dates)", file=sys.stderr)
        sys.exit(1)

    slug = slugify(title)
    walk_dir = os.path.join(args.out_root, f"pr-{number}-{slug}")
    walk_html_path = os.path.join(walk_dir, "walk.html")
    meta_json_path = os.path.join(walk_dir, "meta.json")

    if os.path.exists(walk_dir) and not args.force:
        print(f"ERROR: {walk_dir} already exists — pass --force to overwrite", file=sys.stderr)
        sys.exit(1)
    os.makedirs(walk_dir, exist_ok=True)

    html = read_text(args.template)

    full_title = f"Walk: #{number} · {title}"
    html = html.replace("<!-- TITLE -->", esc(full_title))
    html = html.replace("<!-- DATE -->", today)

    main_css = read_text(args.main_css)
    html = html.replace("<!-- MAIN_CSS -->", f"<style>{main_css}</style>")

    html = html.replace("<!-- BACK_LINK -->", args.back_link)

    title_block = f"""
<div style="margin-bottom:20px;">
  <div style="font-family:var(--mate-font-mono);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--mate-frame-dim);margin-bottom:6px;">{esc(args.repo)}</div>
  <h1 style="margin:0 0 8px;">
    <a href="{url}" target="_blank" rel="noopener noreferrer" style="font-family:var(--mate-font-display);font-size:1.75rem;font-weight:600;line-height:1.3;color:var(--mate-frame-text);text-decoration:none;">{esc(title)}</a>
  </h1>
  <span class="badge badge-ghost" style="font-family:var(--mate-font-mono);font-size:11px;">{esc(head_ref)}</span>
</div>
"""

    sections = [title_block, render_context_section(context)]

    sections.append(f"""
<section style="margin-bottom:2.5rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">The story</h2>
  <p style="font-size:15px;line-height:1.7;color:var(--mate-frame-text);">{esc(story_data['story'])}</p>
</section>
""")

    for extra in extra_sections:
        sections.append(f"""
<section style="margin-bottom:2.5rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">{esc(extra['title'])}</h2>
  <div class="spec-decision" style="font-size:14px;line-height:1.7;white-space:pre-line;">{esc(extra['body'])}</div>
</section>
""")

    sections.append(TOGGLE_JS)
    sections.append(EXPAND_CONTROLS)

    for i, group in enumerate(story_data["groups"], start=1):
        note_html = ""
        if group.get("note"):
            note_html = f'<div class="spec-decision" style="margin-bottom:1rem;">{esc(group["note"])}</div>'
        files_html = "".join(
            render_diff_block(f, args.diff, args.render_diff_bin) for f in group["files"]
        )
        sections.append(f"""
<section style="margin-bottom:2.5rem;">
  <h2 style="position:sticky;top:3.25rem;z-index:5;background:var(--mate-frame-bg);padding:0.6rem 0;margin:0 0 0.25rem;border-bottom:1px solid var(--mate-frame-border);font-family:var(--mate-font-display);font-size:1.4rem;font-weight:600;line-height:1.2;">
    <span style="font-size:0.7rem;font-family:var(--mate-font-body);font-weight:700;color:var(--mate-frame-muted);letter-spacing:0.1em;vertical-align:middle;margin-right:0.5em;">{i:02d}</span>{esc(group['title'])}
  </h2>
  <p style="font-size:14px;color:var(--mate-frame-text);margin:1rem 0;">{esc(group['framing'])}</p>
  {note_html}
  {files_html}
  <div class="walk-note" data-section="{i}" style="margin-top:1.25rem;">
    <textarea placeholder="Note on this section…" style="width:100%;min-height:2.5rem;resize:vertical;background:var(--mate-frame-sidebar);border:1px solid var(--mate-frame-border);border-radius:4px;color:var(--mate-frame-text);font-family:var(--mate-font-body);font-size:13px;padding:0.5rem;box-sizing:border-box;"></textarea>
    <span class="walk-note-status" style="font-size:11px;color:var(--mate-frame-dim);"></span>
  </div>
</section>
""")

    q_html = ""
    for q in questions_data:
        q_html += f"""
  <div class="spec-decision" style="margin-bottom:1rem;">
    <strong style="font-size:14px;">{esc(q['title'])}</strong>
    <p style="margin:0.5rem 0;font-size:14px;">{esc(q['question'])}</p>
    <code style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);">{esc(q['pointer'])}</code>
  </div>
"""
    sections.append(f"""
<section style="margin-bottom:2.5rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:1rem;">Bring your questions</h2>
  {q_html}
</section>
""")

    notes_js = f"""
<script>
  (function () {{
    var prNum = "{number}";
    document.querySelectorAll(".walk-note textarea").forEach(function (ta) {{
      var key = "walk-note-" + prNum + "-" + ta.closest(".walk-note").dataset.section;
      ta.value = localStorage.getItem(key) || "";
      var status = ta.nextElementSibling;
      ta.addEventListener("input", function () {{
        localStorage.setItem(key, ta.value);
        status.textContent = "saved";
        clearTimeout(ta._t);
        ta._t = setTimeout(function () {{ status.textContent = ""; }}, 1200);
      }});
    }});
  }})();
</script>
"""
    sections.append(notes_js)

    overall = judgment_data["overall"]
    badge_class, extra_style = BADGE_CLASS_BY_OVERALL.get(overall, ("badge-open", ""))

    gaps_html = ""
    if judgment_data.get("gaps"):
        gaps_items = "".join(f"<li>{esc(g)}</li>" for g in judgment_data["gaps"])
        gaps_html = f"""
  <div style="margin-bottom:1rem;">
    <strong style="font-size:14px;color:var(--mate-frame-muted);">Gaps</strong>
    <ul style="margin-top:0.5rem;font-size:14px;">{gaps_items}</ul>
  </div>
"""

    risks_summary_html = ""
    if judgment_data.get("risks_summary"):
        rs_items = "".join(f"<li>{esc(r)}</li>" for r in judgment_data["risks_summary"])
        risks_summary_html = f"""
  <div style="margin-bottom:1rem;">
    <strong style="font-size:14px;color:var(--mate-frame-muted);">Risks</strong>
    <ul style="margin-top:0.5rem;font-size:14px;">{rs_items}</ul>
  </div>
"""

    verdict_buttons = "".join(
        f'<button onclick="__walkRevealJudgment(\'{v}\')" style="font-size:13px;padding:0.3rem 0.7rem;border-radius:4px;border:1px solid var(--mate-frame-border);background:var(--mate-frame-sidebar);color:var(--mate-frame-text);cursor:pointer;">{v}</button>'
        for v in ("strong", "solid", "cautious", "concern")
    )
    sections.append(f"""
<div id="walk-judgment-gate" style="margin-bottom:2rem;">
  <p style="font-family:var(--mate-font-body);font-size:14px;color:var(--mate-frame-dim);margin-bottom:0.5rem;">Before you see the AI's judgment — what's yours?</p>
  <div style="display:flex;gap:0.5rem;">
    {verdict_buttons}
  </div>
</div>
<div id="walk-judgment-body" style="display:none;margin-bottom:2rem;padding:1.5rem;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.06);">
  <p id="walk-your-verdict" style="font-size:13px;color:var(--mate-frame-dim);margin-bottom:1rem;"></p>
  <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
    <span style="font-family:var(--mate-font-display);font-size:1.1rem;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.08em;">Judgment</span>
    <span class="badge {badge_class}"{extra_style}>{esc(overall)}</span>
  </div>
  <p style="font-size:14px;margin-bottom:1rem;"><strong>Fit:</strong> {esc(judgment_data['fit'])}</p>
  {risks_summary_html}
  {gaps_html}
</div>
<script>
  window.__walkRevealJudgment = function (yourVerdict) {{
    var gate = document.getElementById("walk-judgment-gate");
    var body = document.getElementById("walk-judgment-body");
    var yours = document.getElementById("walk-your-verdict");
    var aiVerdict = "{overall}";
    yours.textContent = yourVerdict === aiVerdict
      ? "You called it \\"" + yourVerdict + "\\" — matches."
      : "You called it \\"" + yourVerdict + "\\" — the AI landed on \\"" + aiVerdict + "\\".";
    gate.style.display = "none";
    body.style.display = "block";
  }};
</script>
""")

    content_main = "".join(sections)

    risks_rail = ""
    if risks_data:
        risk_rows = "".join(
            f'<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:10px;"><span style="color:var(--mate-warning);font-size:11px;flex-shrink:0;margin-top:1px;">&#9888;</span><span style="font-size:11px;color:var(--mate-frame-text);line-height:1.4;">{esc(r["title"])}</span></div>'
            for r in risks_data
        )
        risks_rail = f"""
    <div class="spec-rail-row" style="border-top:1px solid var(--mate-frame-border);">
      <span class="spec-rail-label">RISKS</span>
    </div>
    <div class="spec-rail-row">
      {risk_rows}
    </div>
"""

    rail = f"""
  <aside class="spec-rail">
    <div class="spec-rail-row">
      <span class="spec-rail-label">AUTHOR</span>
      <span class="spec-rail-value">{esc(author)}</span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">PR</span>
      <span class="spec-rail-value"><a href="{url}" style="color:var(--mate-primary);">#{number}</a></span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">REPO</span>
      <span class="spec-rail-value" style="font-size:14px;word-break:break-all;">{esc(args.repo)}</span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">CHANGES</span>
      <span class="spec-rail-value">
        <span style="color:var(--mate-success);">+{additions}</span>
        <span style="color:var(--mate-error);">&#8722;{deletions}</span>
        <br><span style="color:var(--mate-frame-muted);font-size:14px;">{changed_files} files</span>
      </span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">BRANCH</span>
      <span class="spec-rail-value" style="font-size:14px;word-break:break-all;">{esc(head_ref)}</span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">CONTEXT</span>
      <span class="spec-rail-value">{esc(context_mode)}</span>
    </div>
    {risks_rail}
  </aside>
"""

    full_content = f"""
<style>
  .spec-layout {{ grid-template-columns: minmax(0, 1fr) 220px; }}
  .spec-rail {{ position: sticky; top: 3.25rem; max-height: calc(100vh - 3.75rem); overflow-y: auto; }}
</style>
<div class="spec-layout">
  <div style="min-width:0;">
    {content_main}
  </div>
  {rail}
</div>
"""

    html = html.replace("<!-- CONTENT -->", full_content, 1)

    def add_target(m):
        tag = m.group(0)
        if 'target=' in tag:
            return tag
        return tag[:-1] + ' target="_blank" rel="noopener noreferrer">'
    html = re.sub(r'<a\s[^>]+>', add_target, html)

    with open(walk_html_path, "w") as f:
        f.write(html)

    meta = {
        "pr": number,
        "url": url,
        "title": title,
        "author": author,
        "repo": args.repo,
        "date": today,
        "tags": extract_tags(title, args.tags),
        "context_mode": context_mode,
        "verdict": None,
        "your_notes": "",
        "judgment_overall": overall,
        "judgment_risks": judgment_data.get("risks_summary", []),
        "delta": "",
    }
    with open(meta_json_path, "w") as f:
        json.dump(meta, f, indent=2)

    lint = subprocess.run(["node", args.lint_bin, walk_html_path], capture_output=True, text=True)
    if lint.returncode != 0:
        print(lint.stdout, file=sys.stderr)
        print(lint.stderr, file=sys.stderr)
        print("WARNING: lint violations found — review before opening. "
              "Violations inside the inlined <style> block or the header/footer "
              "chrome are template-origin and expected (inlined-css, no-stylesheet, "
              "small-font in nav/footer/rail-label).", file=sys.stderr)

    print(walk_dir)


if __name__ == "__main__":
    main()
