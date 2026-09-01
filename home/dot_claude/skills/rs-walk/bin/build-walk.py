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
    --ticket-fit /tmp/walk-N-ticket-fit.json \
    --comment-triage /tmp/walk-N-comment-triage.json \
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
  --story       JSON: {lead?, story:[beat, ...], groups:[{title, lead?, framing,
                       files:[...], note?}]}. `story` is an array of beats, not
                       one paragraph. `lead`/`story`/`framing`/`note` may contain
                       **bold** spans, converted to <strong> (see render_prose).
  --questions   JSON: [{title, question, pointer}]
  --risks       JSON: [{title, description, blast_radius, file}]
  --judgment    JSON: {fit, risks_summary:[...], gaps:[...], overall}
  --context     JSON: {mode:"qmd"|"grep", items:[...]}
                 qmd items: [{path, score, snippet}]
                 grep items: ["path", ...]
                 empty items -> renders the standard "nothing found" fallback
  --extra-sections  optional JSON: [{title, body}] or [{title, html}] —
                 supplementary content sections (e.g. answering a side
                 question the user asked alongside the PR URL) inserted
                 after "The story" and before the diff groups. `body` is
                 escaped plain text (white-space:pre-line). `html` is
                 inserted raw — use for code comparisons/tables; caller is
                 responsible for escaping any untrusted content within it.
                 Omit the whole option if there's nothing supplementary.
  --ticket-fit  optional JSON: {ticket_key, ticket_quality:{score, notes},
                 acceptance_criteria:[{criterion, status, evidence}],
                 scope_delta} — rendered right after "The story". Omit
                 (or pass a file with ticket_key: null) when no ticket is
                 linked; renders a "no ticket linked" note instead of
                 failing.
  --comment-triage  optional JSON: [{author, author_kind:"bot"|"human",
                 human_authenticity?:"genuine"|"bot-posing-as-human"|"uncertain",
                 summary, resolved?}] — rendered as a collapsed "Prior
                 discussion" section near the end, after the questions
                 section. This data must never reach Agents 1-4 (story,
                 questions, risks, judgment) — see Step 4's isolation rule.

Writes <out-root>/pr-<number>-<slug>/walk.html and meta.json. Prints the
walk directory path to stdout on success.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RENDER_DIFF = os.path.join(SKILL_DIR, "bin", "render-diff.sh")
DEFAULT_TEMPLATE = os.path.join(SKILL_DIR, "assets", "walk-template.html")
DEFAULT_MAIN_CSS = os.path.join(SKILL_DIR, "assets", "walk.css")
DEFAULT_LINT_BIN = os.path.join(SKILL_DIR, "bin", "lint-walk.mjs")
VERSION = "2.0.0"
DEFAULT_OUT_ROOT = os.path.expanduser("~/brain/wiki/walks")
DEFAULT_BACK_LINK = "../index.html"

BADGE_CLASS_BY_OVERALL = {
    "strong": ("badge-done", ""),
    "solid": ("badge-building", ""),
    "cautious": ("badge-open", ' style="background:var(--mate-warning);color:var(--color-warning-content);"'),
    "concern": ("badge-open", ' style="background:var(--mate-error);color:var(--color-error-content);"'),
}

# Ordered worst-to-best matters: the reveal measures how far the reviewer's call
# sat from the AI's, and a two-step gap reads differently from one.
VERDICT_SCALE = ["strong", "solid", "cautious", "concern"]

# Four distinct hues, or the scale reads as two. --mate-erva resolves to the
# same green as --mate-success, so "solid" borrows info-blue instead.
VERDICT_TONE = {
    "strong": "var(--mate-success)",
    "solid": "var(--mate-info)",
    "cautious": "var(--mate-warning)",
    "concern": "var(--mate-error)",
}


def estimate_read_time(prose_parts, diff_text):
    """Minutes to read a walk, as a range.

    Prose at 220 wpm. Diff lines are the slow part and the rate depends on what
    they are: a changed line wants reading, a context line is scanned. Counted
    separately at 45 and 140 lines/min, from timing real walks rather than from
    a general reading-speed figure — code review is not prose.
    """
    words = sum(len(str(p).split()) for p in prose_parts if p)

    changed = context = 0
    for line in diff_text.splitlines():
        if line.startswith(("+++", "---", "diff ", "index ", "@@")):
            continue
        if line.startswith(("+", "-")):
            changed += 1
        elif line:
            context += 1

    minutes = words / 220 + changed / 45 + context / 140
    low = max(1, round(minutes * 0.8))
    high = max(low + 1, round(minutes * 1.3))
    return f"{low}–{high} min"


def esc(s):
    # Quotes included — esc() output lands in attributes (e.g. title="...").
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


BOLD_RE = re.compile(r"\*\*(.+?)\*\*")


def render_prose(s):
    """Escape first, then let **word** survive as <strong> — the only markup
    an agent can produce. Escaping runs before the conversion, so anything
    hostile in the source text (a literal `<script>`, another `**` pair
    fighting for the closing pair) is already inert by the time this looks
    for bold markers; it can only ever produce <strong> tags, nothing else.
    Never use this on attribute values — only on text that lands in a text
    node, where a real HTML element is what "bold" is supposed to mean.
    """
    return BOLD_RE.sub(r"<strong>\1</strong>", esc(s))


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
      <span class="diff-file-dir">{esc(dirname)}/</span>
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
    // Scoped to one section: that is the unit you actually read in, and a
    // section with six files is where folding earns its place.
    window.__walkToggleSection = function (section) {
      const head = document.querySelector(
        '.walk-fold-toggle[data-section="' + section + '"]');
      if (!head) return;
      const blocks = head.closest(".walk-section")
        .querySelectorAll("details.diff-block");
      const anyOpen = Array.from(blocks).some((d) => d.open);
      blocks.forEach((d) => { d.open = !anyOpen; });
      head.dataset.folded = anyOpen ? "true" : "false";
      head.setAttribute("aria-expanded", String(!anyOpen));
    };
  })();
</script>
"""



TICKET_QUALITY_TONE = {
    "good": "var(--mate-success)",
    "adequate": "var(--mate-info)",
    "thin": "var(--mate-warning)",
    "missing": "var(--mate-error)",
}

AC_STATUS_TONE = {
    "Met": "var(--mate-success)",
    "Partially Met": "var(--mate-warning)",
    "Not Met": "var(--mate-error)",
    "Unplanned Deviation": "var(--mate-error)",
}

# --mate-success/warning/error/info flip lightness between themes (dark theme
# uses a light, saturated chip; light theme uses a darker one) so a literal
# `color:#fff` passes contrast in one theme and fails it in the other. The
# --color-*-content tokens are pre-tuned per theme for exactly this pairing —
# use them instead of a hardcoded foreground on any --mate-<tone> background.
TONE_CONTENT = {
    "var(--mate-success)": "var(--color-success-content)",
    "var(--mate-warning)": "var(--color-warning-content)",
    "var(--mate-error)": "var(--color-error-content)",
    "var(--mate-info)": "var(--color-info-content)",
}


def badge_fg(tone):
    return TONE_CONTENT.get(tone, "var(--mate-frame-text)")


AUTHOR_KIND_LABEL = {"bot": "BOT", "human": "HUMAN"}


def render_ticket_fit_section(ticket_fit):
    if not ticket_fit or not ticket_fit.get("ticket_key"):
        return """
<section style="margin-bottom:2rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">Ticket fit</h2>
  <p style="color:var(--mate-frame-text);font-size:14px;">No ticket linked to this PR — nothing to compare against.</p>
</section>
"""
    quality = ticket_fit.get("ticket_quality", {})
    q_score = quality.get("score", "adequate")
    q_tone = TICKET_QUALITY_TONE.get(q_score, "var(--mate-frame-dim)")
    # One line per AC: status tag + criterion. Evidence moves to a hover
    # tooltip instead of its own block — the point of this section is a
    # scannable tag row, not a restatement of the ticket.
    ac_rows = "".join(
        f'<div style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.4rem;">'
        f'<span class="badge" style="background:{AC_STATUS_TONE.get(ac.get("status", ""), "var(--mate-frame-dim)")};color:{badge_fg(AC_STATUS_TONE.get(ac.get("status", ""), ""))};flex-shrink:0;" title="{esc(ac.get("evidence", ""))}">{esc(ac.get("status", ""))}</span>'
        f'<span style="font-size:13px;line-height:1.5;color:var(--mate-frame-text);">{esc(ac.get("criterion", ""))}</span>'
        f'</div>'
        for ac in ticket_fit.get("acceptance_criteria", [])
    )
    scope_delta = ticket_fit.get("scope_delta", "")
    scope_html = (
        f'<div style="display:flex;align-items:flex-start;gap:0.5rem;margin-top:0.6rem;">'
        f'<span class="badge" style="background:var(--mate-warning);color:{badge_fg("var(--mate-warning)")};flex-shrink:0;">scope delta</span>'
        f'<span style="font-size:13px;color:var(--mate-frame-text);">{render_prose(scope_delta)}</span>'
        f'</div>'
        if scope_delta else ""
    )
    # Badges first, then the notes prose — a reviewer scans Met/Not-Met before
    # reading why the ticket itself was thin. Notes used to lead, which meant
    # 40-60 words of prose stood between the header and the one scannable row.
    return f"""
<section style="margin-bottom:2rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.6rem;">
    Ticket fit &mdash; {esc(ticket_fit['ticket_key'])}
    <span class="badge" style="background:{q_tone};color:{badge_fg(q_tone)};margin-left:0.4rem;text-transform:none;letter-spacing:normal;">{esc(q_score)}</span>
  </h2>
  {ac_rows}
  {scope_html}
  <p style="font-size:13px;color:var(--mate-frame-muted);margin-top:0.75rem;line-height:1.5;">{render_prose(quality.get("notes", ""))}</p>
</section>
"""


def render_comment_triage_section(comment_triage):
    if comment_triage is None:
        return ""
    entries = comment_triage if isinstance(comment_triage, list) else comment_triage.get("entries", [])
    if not entries:
        return """
<section style="margin-bottom:2.5rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">Prior discussion</h2>
  <p style="color:var(--mate-frame-text);font-size:14px;">No comments or reviews yet.</p>
</section>
"""
    rows = ""
    for e in entries:
        kind = e.get("author_kind", "uncertain")
        badge_tone = (
            "var(--mate-info)" if kind == "human"
            else "var(--mate-frame-dim)" if kind == "bot"
            else "var(--mate-warning)"
        )
        auth_note = ""
        if kind == "human" and e.get("human_authenticity") and e["human_authenticity"] != "genuine":
            auth_note = f' <span class="badge" style="background:var(--mate-warning);color:{badge_fg("var(--mate-warning)")};font-size:10px;">{esc(e["human_authenticity"])}</span>'
        resolved = " &#10003; resolved" if e.get("resolved") else ""
        rows += f"""
    <div class="spec-decision" style="margin-bottom:0.6rem;display:flex;gap:0.5rem;align-items:flex-start;">
      <span class="badge" style="background:{badge_tone};color:{badge_fg(badge_tone)};font-size:10px;flex-shrink:0;">{esc(AUTHOR_KIND_LABEL.get(kind, "?"))}</span>
      <div style="min-width:0;">
        <strong style="font-size:13px;">{esc(e.get("author", ""))}</strong>{auth_note}
        <span style="font-size:12px;color:var(--mate-frame-muted);">{resolved}</span>
        <p style="margin:0.3rem 0 0;font-size:13px;color:var(--mate-frame-text);">{esc(e.get("summary", ""))}</p>
      </div>
    </div>
"""
    return f"""
<section style="margin-bottom:2.5rem;">
  <details>
    <summary style="cursor:pointer;list-style:none;"><h2 style="display:inline;font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;">Prior discussion ({len(entries)})</h2></summary>
    <div style="margin-top:1rem;">
      {rows}
    </div>
  </details>
</section>
"""


def render_context_rail(context, max_items=5):
    """Related-notes list for the sidebar, not the first fold.

    Was a full section at the top of the page, ahead of "The story" — on a
    PR with a handful of hits that pushed the actual narrative below the
    fold before a reader saw a word of it. A `<details>` in the rail costs
    nothing until opened and doesn't compete with the story for first look.
    """
    mode = context.get("mode", "grep")
    items = context.get("items", [])[:max_items]
    if not items:
        return """
    <div class="spec-rail-row" style="border-top:1px solid var(--mate-frame-border);">
      <span class="spec-rail-label">CONTEXT</span>
      <span class="spec-rail-value" style="font-size:12px;color:var(--mate-frame-muted);">Nothing found — first walk here.</span>
    </div>
"""
    if mode == "qmd":
        lis = "".join(
            f'<li style="margin-bottom:0.5rem;line-height:1.4;">'
            f'<span style="color:var(--mate-frame-muted);">[{esc(it.get("score", ""))}%]</span> '
            f'{esc(it.get("path", ""))}</li>'
            for it in items
        )
    else:
        lis = "".join(f'<li style="margin-bottom:0.5rem;line-height:1.4;">{esc(it)}</li>' for it in items)
    return f"""
    <div class="spec-rail-row" style="border-top:1px solid var(--mate-frame-border);">
      <span class="spec-rail-label">CONTEXT</span>
      <span class="spec-rail-value" style="font-size:12px;">{esc(mode)}</span>
    </div>
    <div class="spec-rail-row">
      <details>
        <summary style="cursor:pointer;font-size:11px;color:var(--mate-primary);">{len(items)} related note{"s" if len(items) != 1 else ""}</summary>
        <ul style="padding-left:1rem;margin-top:0.5rem;font-size:11px;color:var(--mate-frame-text);">{lis}</ul>
      </details>
    </div>
"""


def render_ticket_rail(ticket_fit):
    """Compact ticket tags for the sidebar — the quality score and an
    AC met/not-met tally, so a later pass over many walks can scan the rail
    instead of re-reading each ticket-fit section."""
    if not ticket_fit or not ticket_fit.get("ticket_key"):
        return ""
    quality = ticket_fit.get("ticket_quality", {})
    q_score = quality.get("score", "adequate")
    q_tone = TICKET_QUALITY_TONE.get(q_score, "var(--mate-frame-dim)")
    ac_list = ticket_fit.get("acceptance_criteria", [])
    counts = {}
    for ac in ac_list:
        status = ac.get("status", "")
        counts[status] = counts.get(status, 0) + 1
    count_chips = "".join(
        f'<span class="badge" style="background:{AC_STATUS_TONE.get(status, "var(--mate-frame-dim)")};color:{badge_fg(AC_STATUS_TONE.get(status, ""))};margin-right:0.3rem;margin-bottom:0.3rem;">{count} {esc(status)}</span>'
        for status, count in counts.items()
    )
    return f"""
    <div class="spec-rail-row" style="border-top:1px solid var(--mate-frame-border);">
      <span class="spec-rail-label">TICKET</span>
      <span class="spec-rail-value" style="font-size:13px;">{esc(ticket_fit['ticket_key'])}</span>
    </div>
    <div class="spec-rail-row">
      <span class="badge" style="background:{q_tone};color:{badge_fg(q_tone)};margin-bottom:0.4rem;">{esc(q_score)}</span>
      <div>{count_chips}</div>
    </div>
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
    ap.add_argument("--ticket-fit", default=None)
    ap.add_argument("--comment-triage", default=None)
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
    ticket_fit = read_json(args.ticket_fit) if args.ticket_fit else None
    comment_triage = read_json(args.comment_triage) if args.comment_triage else None

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
    html = html.replace(
        "<!-- DESCRIPTION -->",
        esc(f"PR walkthrough for {args.repo}#{number} — {title}"),
    )

    read_time = estimate_read_time(
        [story_data.get("lead", "")]
        + story_data.get("story", [])
        + [g.get("lead", "") for g in story_data["groups"]]
        + [g.get("framing", "") for g in story_data["groups"]]
        + [g.get("note", "") for g in story_data["groups"]]
        + [q.get("question", "") for q in questions_data]
        + [judgment_data.get("fit", "")]
        + judgment_data.get("risks_summary", [])
        + judgment_data.get("gaps", [])
        + ([ticket_fit.get("ticket_quality", {}).get("notes", "")]
           + [ac.get("criterion", "") for ac in ticket_fit.get("acceptance_criteria", [])]
           if ticket_fit else []),
        read_text(args.diff),
    )
    html = html.replace("<!-- READ_TIME -->", esc(read_time))
    html = html.replace("<!-- DATE -->", today)

    main_css = read_text(args.main_css)
    html = html.replace("<!-- MAIN_CSS -->", f"<style>{main_css}</style>")

    # Stamp what built this and which stylesheet went in, so drift is greppable
    # instead of an archaeology session.
    css_hash = hashlib.sha256(main_css.encode()).hexdigest()[:8]
    html = html.replace(
        "<!-- GENERATOR -->",
        f'<meta name="generator" content="rs-walk@{VERSION} walk-css@{css_hash}" />',
    )

    # Must stay relative: a walk is read over file:// as often as over the
    # artifact server, and a root-absolute href resolves to file:///... there.
    back_link = args.back_link
    if back_link.startswith("/"):
        print(f"WARNING: --back-link {back_link!r} is root-absolute and breaks "
              "over file:// — falling back to the relative default.", file=sys.stderr)
        back_link = DEFAULT_BACK_LINK
    html = html.replace("<!-- BACK_LINK -->", back_link)

    title_block = f"""
<div style="margin-bottom:20px;">
  <div style="font-family:var(--mate-font-mono);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--mate-frame-dim);margin-bottom:6px;">{esc(args.repo)}</div>
  <h1 style="margin:0 0 8px;">
    <a href="{url}" target="_blank" rel="noopener noreferrer" style="font-family:var(--mate-font-display);font-size:1.75rem;font-weight:600;line-height:1.3;color:var(--mate-frame-text);text-decoration:none;">{esc(title)}</a>
  </h1>
  <span class="badge badge-ghost" style="font-family:var(--mate-font-mono);font-size:11px;">{esc(head_ref)}</span>
</div>
"""

    sections = [title_block]

    story_lead_html = (
        f'<p class="walk-story-lead">{render_prose(story_data["lead"])}</p>'
        if story_data.get("lead") else ""
    )
    story_beats_html = "".join(
        f"<p>{render_prose(beat)}</p>" for beat in story_data.get("story", [])
    )
    sections.append(f"""
<section style="margin-bottom:2.5rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">The story</h2>
  {story_lead_html}
  <div class="walk-story">
    {story_beats_html}
  </div>
</section>
""")

    for extra in extra_sections:
        body_html = extra["html"] if extra.get("html") else f'<div class="spec-decision" style="font-size:14px;line-height:1.7;white-space:pre-line;">{esc(extra["body"])}</div>'
        sections.append(f"""
<section style="margin-bottom:2.5rem;">
  <h2 style="font-family:var(--mate-font-body);font-size:0.7rem;font-weight:700;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.75rem;">{esc(extra['title'])}</h2>
  {body_html}
</section>
""")

    sections.append(TOGGLE_JS)

    for i, group in enumerate(story_data["groups"], start=1):
        note_html = ""
        if group.get("note"):
            note_html = f'<div class="spec-decision" style="margin-bottom:1rem;">{render_prose(group["note"])}</div>'
        subtitle_html = (
            f'<p class="walk-section-subtitle">{render_prose(group["lead"])}</p>'
            if group.get("lead") else ""
        )
        files_html = "".join(
            render_diff_block(f, args.diff, args.render_diff_bin) for f in group["files"]
        )
        sections.append(f"""
<section class="walk-section">
  <div class="walk-section-head">
    <div class="walk-section-heading">
      <h2 class="walk-section-title">
        <span class="walk-section-num">{i:02d}</span>{esc(group['title'])}
      </h2>
      {subtitle_html}
    </div>
    <div class="walk-section-tools">
      <button class="walk-note-toggle" data-section="{i}"
              onclick="__walkToggleNote({i})"
              aria-expanded="false" aria-controls="walk-note-{i}"
              aria-label="Your note on section {i}, {esc(group['title'])}">
        <span class="walk-note-mark" aria-hidden="true"></span><span>note</span>
      </button>
      <button class="walk-fold-toggle" data-section="{i}"
              onclick="__walkToggleSection({i})"
              aria-expanded="true"
              aria-label="Collapse the diffs in section {i}, {esc(group['title'])}">
        <span class="walk-fold-icon" aria-hidden="true">&#9662;</span>
      </button>
    </div>
  </div>
  <div class="walk-note" id="walk-note-{i}" data-section="{i}" hidden>
    <textarea placeholder="What did you make of this section&#8230;"></textarea>
    <span class="walk-note-status"></span>
  </div>
  <p class="walk-section-framing">{render_prose(group['framing'])}</p>
  {note_html}
  {files_html}
</section>
""")

    # Ticket fit lands here, not up top — it's a post-read checklist ("did
    # this match what was asked") rather than context to prime the diff with,
    # so it sits next to questions/judgment, the other reflection sections.
    sections.append(render_ticket_fit_section(ticket_fit))

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

    sections.append(render_comment_triage_section(comment_triage))

    notes_js = f"""
<script>
  (function () {{
    var prNum = "{number}";

    function noteBox(section) {{
      return document.querySelector('.walk-note[data-section="' + section + '"]');
    }}
    function noteToggle(section) {{
      return document.querySelector('.walk-note-toggle[data-section="' + section + '"]');
    }}

    // The toggle carries the section's state into the sticky header, so you can
    // see which sections you have already written up while scrolling past them.
    function markToggle(section, filled) {{
      var btn = noteToggle(section);
      if (btn) btn.dataset.filled = filled ? "true" : "false";
    }}

    window.__walkToggleNote = function (section) {{
      var box = noteBox(section);
      if (!box) return;
      box.hidden = !box.hidden;
      var btn = noteToggle(section);
      if (btn) btn.setAttribute("aria-expanded", String(!box.hidden));
      if (!box.hidden) box.querySelector("textarea").focus();
    }};

    document.querySelectorAll(".walk-note textarea").forEach(function (ta) {{
      var box = ta.closest(".walk-note");
      var section = box.dataset.section;
      var key = "walk-note-" + prNum + "-" + section;
      var saved = localStorage.getItem(key) || "";
      ta.value = saved;
      // Only claim vertical space where there is something to read.
      if (saved.trim()) {{
        box.hidden = false;
        markToggle(section, true);
        var t = noteToggle(section);
        if (t) t.setAttribute("aria-expanded", "true");
      }}
      var status = ta.nextElementSibling;
      ta.addEventListener("input", function () {{
        localStorage.setItem(key, ta.value);
        markToggle(section, ta.value.trim().length > 0);
        status.textContent = "saved";
        clearTimeout(ta._t);
        ta._t = setTimeout(function () {{ status.textContent = ""; }}, 1200);
      }});
    }});

    // Notes live in localStorage, which is origin-scoped — a walk read over
    // file:// and the same walk read over http://localhost are separate
    // buckets. Claude normally lifts them straight out of the open page at
    // close time; this button is the fallback when it cannot reach the browser.
    window.exportWalkNotes = function () {{
      var out = {{ pr: prNum, notes: {{}} }};
      document.querySelectorAll(".walk-note").forEach(function (n) {{
        var v = n.querySelector("textarea").value.trim();
        if (v) out.notes[n.dataset.section] = v;
      }});
      var a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(out, null, 2)], {{ type: "application/json" }})
      );
      a.download = "walk-notes-" + prNum + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    }};
  }})();
</script>
"""
    sections.append(notes_js)

    overall = judgment_data["overall"]
    badge_class, extra_style = BADGE_CLASS_BY_OVERALL.get(overall, ("badge-open", ""))

    def judgment_panel(kind, label, items):
        if items:
            body = ('<ul class="judgment-list">'
                    + "".join(f"<li>{render_prose(i)}</li>" for i in items)
                    + "</ul>")
            count = f'<span class="judgment-panel-count">{len(items)}</span>'
        else:
            body = f'<p class="judgment-empty">None called out.</p>'
            count = ""
        return f"""
  <div class="judgment-panel" data-kind="{kind}">
    <div class="judgment-panel-head">
      <span class="judgment-panel-title">{label}</span>{count}
    </div>
    {body}
  </div>"""

    panels = (judgment_panel("risks", "Risks", judgment_data.get("risks_summary", []))
              + judgment_panel("gaps", "Gaps", judgment_data.get("gaps", [])))

    verdict_chips = "".join(
        f'<button class="verdict-chip" data-verdict="{v}" '
        f"onclick=\"__walkRevealJudgment('{v}')\">{v}</button>"
        for v in VERDICT_SCALE
    )
    tone = VERDICT_TONE.get(overall, "var(--mate-frame-dim)")

    sections.append(f"""
<div class="judgment-gate" id="walk-judgment-gate">
  <div class="judgment-gate-eyebrow">Sealed until you commit</div>
  <p class="judgment-gate-ask">What's your read?</p>
  <p class="judgment-gate-hint">
    Pick one and the AI's judgment unseals. Yours first — that's the point.
  </p>
  <div class="verdict-scale">{verdict_chips}</div>
</div>

<div class="judgment-card" id="walk-judgment-body" hidden style="--verdict-tone:{tone};">
  <div class="judgment-head">
    <div>
      <span class="judgment-head-label">AI judgment</span>
      <span class="judgment-verdict">{esc(overall)}</span>
    </div>
    <div class="judgment-agreement" id="walk-your-verdict">
      <span class="judgment-agreement-icon" id="walk-verdict-icon"></span>
      <span id="walk-verdict-text"></span>
    </div>
  </div>
  <p class="judgment-fit">{render_prose(judgment_data['fit'])}</p>
  <div class="judgment-grid">{panels}
  </div>
</div>
<script>
  window.__walkRevealJudgment = function (yourVerdict) {{
    var SCALE = {json.dumps(VERDICT_SCALE)};
    var ai = {json.dumps(overall)};
    var gap = Math.abs(SCALE.indexOf(yourVerdict) - SCALE.indexOf(ai));
    var strip = document.getElementById("walk-your-verdict");
    var icon = document.getElementById("walk-verdict-icon");
    var text = document.getElementById("walk-verdict-text");

    if (gap === 0) {{
      strip.dataset.state = "match";
      icon.innerHTML = "&#10003;";
      text.innerHTML = "You called it <strong>" + yourVerdict +
        "</strong> too. Same read.";
    }} else {{
      strip.dataset.state = "diverge";
      icon.innerHTML = "&#8646;";
      text.innerHTML = "You said <strong>" + yourVerdict +
        "</strong>, the AI said <strong>" + ai + "</strong>" +
        (gap > 1 ? " — two steps apart, worth reconciling before you submit."
                 : " — one step apart.");
    }}

    document.getElementById("walk-judgment-gate").hidden = true;
    var body = document.getElementById("walk-judgment-body");
    body.hidden = false;
    body.scrollIntoView({{ behavior: "smooth", block: "nearest" }});
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

    ticket_rail = render_ticket_rail(ticket_fit)
    context_rail = render_context_rail(context)

    discussion_rail = ""
    if comment_triage is not None:
        entries = comment_triage if isinstance(comment_triage, list) else comment_triage.get("entries", [])
        bot_n = sum(1 for e in entries if e.get("author_kind") == "bot")
        human_n = sum(1 for e in entries if e.get("author_kind") == "human")
        open_n = sum(1 for e in entries if not e.get("resolved"))
        discussion_tone = "var(--mate-warning)" if open_n else "var(--mate-success)"
        discussion_rail = f"""
    <div class="spec-rail-row" style="border-top:1px solid var(--mate-frame-border);">
      <span class="spec-rail-label">DISCUSSION</span>
      <span class="spec-rail-value" style="font-size:12px;">{len(entries)} entries &mdash; {human_n} human, {bot_n} bot</span>
    </div>
    <div class="spec-rail-row">
      <span class="badge" style="background:{discussion_tone};color:{badge_fg(discussion_tone)};">{open_n} open</span>
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
    {ticket_rail}
    {discussion_rail}
    {context_rail}
    {risks_rail}
  </aside>
"""

    full_content = f"""
<style>
  .spec-layout {{ grid-template-columns: minmax(0, 1fr) 220px; }}
  .spec-rail {{ position: sticky; top: calc(var(--walk-header-h) + 1rem); max-height: calc(100vh - var(--walk-header-h) - 2rem); overflow-y: auto; }}
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
        "read_time": read_time,
        "ticket_key": ticket_fit.get("ticket_key") if ticket_fit else None,
        "ticket_quality": ticket_fit.get("ticket_quality", {}).get("score") if ticket_fit else None,
        # Per-AC status tags plus a rollup count, so a later pass across many
        # walks can answer "how often do tickets actually get Met" without
        # re-opening each walk.html.
        "ticket_ac_tags": [ac.get("status") for ac in ticket_fit.get("acceptance_criteria", [])] if ticket_fit else None,
        "ticket_ac_summary": (lambda acs: {
            status: sum(1 for a in acs if a.get("status") == status)
            for status in {a.get("status") for a in acs}
        })(ticket_fit.get("acceptance_criteria", [])) if ticket_fit and ticket_fit.get("acceptance_criteria") else None,
        "comment_counts": (lambda entries: {
            "bot": sum(1 for e in entries if e.get("author_kind") == "bot"),
            "human": sum(1 for e in entries if e.get("author_kind") == "human"),
            "uncertain": sum(1 for e in entries if e.get("author_kind") not in ("bot", "human")),
        })(comment_triage if isinstance(comment_triage, list) else (comment_triage or {}).get("entries", []))
        if comment_triage is not None else None,
    }
    with open(meta_json_path, "w") as f:
        json.dump(meta, f, indent=2)

    lint = subprocess.run(["node", args.lint_bin, walk_html_path], capture_output=True, text=True)
    if lint.returncode != 0:
        print(lint.stdout, file=sys.stderr)
        print(lint.stderr, file=sys.stderr)
        print(f"ERROR: {walk_html_path} failed lint — not a valid standalone walk.",
              file=sys.stderr)
        sys.exit(1)

    print(walk_dir)


if __name__ == "__main__":
    main()
