#!/usr/bin/env python3
"""Render a unified diff between two text files as a mate-DS code-diff HTML artifact,
with a full rendered-markdown pane of the new version alongside it.

Usage: render-md-diff.py <old> <new> <title> <out.html> <port>
Reusable for any future "iterate on this doc, show me only the diff" request.
"""
import base64
import difflib
import html
import sys

old_path, new_path, title, out_path, port = sys.argv[1:6]

with open(old_path) as f:
    old_lines = f.readlines()
with open(new_path) as f:
    new_lines = f.readlines()

diff = list(difflib.unified_diff(old_lines, new_lines, lineterm=""))

added = sum(1 for line in diff if line.startswith("+") and not line.startswith("+++"))
removed = sum(1 for line in diff if line.startswith("-") and not line.startswith("---"))

body_parts = []
old_no = new_no = 0
for line in diff:
    if line.startswith("+++") or line.startswith("---"):
        continue
    if line.startswith("@@"):
        body_parts.append(f'<div class="diff-hunk-header">{html.escape(line)}</div>')
        # parse @@ -old_start,old_len +new_start,new_len @@
        try:
            ranges = line.split("@@")[1].strip().split(" ")
            old_no = int(ranges[0].split(",")[0].lstrip("-"))
            new_no = int(ranges[1].split(",")[0].lstrip("+"))
        except (IndexError, ValueError):
            pass
        continue
    if line.startswith("+"):
        code = html.escape(line[1:]) or "&nbsp;"
        body_parts.append(
            f'<div class="diff-line added"><span class="diff-line-num"></span>'
            f'<span class="diff-line-num">{new_no}</span><span class="diff-prefix">+</span>'
            f'<span class="diff-line-code">{code}</span></div>'
        )
        new_no += 1
    elif line.startswith("-"):
        code = html.escape(line[1:]) or "&nbsp;"
        body_parts.append(
            f'<div class="diff-line removed"><span class="diff-line-num">{old_no}</span>'
            f'<span class="diff-line-num"></span><span class="diff-prefix">-</span>'
            f'<span class="diff-line-code">{code}</span></div>'
        )
        old_no += 1
    else:
        code = html.escape(line[1:]) or "&nbsp;"
        body_parts.append(
            f'<div class="diff-line context"><span class="diff-line-num">{old_no}</span>'
            f'<span class="diff-line-num">{new_no}</span><span class="diff-prefix"> </span>'
            f'<span class="diff-line-code">{code}</span></div>'
        )
        old_no += 1
        new_no += 1

diff_html = "\n".join(body_parts) if body_parts else '<div class="diff-line context"><span class="diff-line-code">No changes.</span></div>'

new_md_b64 = base64.b64encode("".join(new_lines).encode("utf-8")).decode("ascii")

page = f"""<!DOCTYPE html>
<html lang="en" data-theme="mate">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="http://localhost:{port}/style/mate-doc.css">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  body {{ padding: 32px; }}
  .page-wrap {{ max-width: 1500px; width: 100%; margin: 0 auto; }}
  .topbar {{ display: flex; justify-content: flex-end; margin-bottom: 12px; }}
  .columns {{ display: flex; gap: 20px; align-items: flex-start; }}
  .col {{ flex: 1; min-width: 0; }}
  .col-heading {{ font-family: var(--mate-font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mate-frame-muted); margin-bottom: 8px; }}

  .diff-block {{ background: var(--mate-frame-sidebar); border: 1px solid var(--mate-frame-border); border-radius: 8px; overflow: hidden; font-family: var(--mate-font-mono); font-size: 12px; max-height: 82vh; overflow-y: auto; }}
  .diff-file-header {{ position: sticky; top: 0; background: var(--mate-frame-nav); padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--mate-frame-border); font-size: 13px; color: var(--mate-frame-text); }}
  .diff-stats .added {{ color: var(--mate-success); }} .diff-stats .removed {{ color: var(--mate-error); }}
  .diff-hunk-header {{ background: rgba(63,159,232,0.12); color: var(--mate-info); padding: 4px 16px; font-size: 11px; border-bottom: 1px solid rgba(63,159,232,0.2); }}
  .diff-line {{ display: flex; }}
  .diff-line-num {{ width: 40px; text-align: right; padding: 2px 6px; color: var(--mate-frame-muted); user-select: none; border-right: 1px solid var(--mate-frame-border); flex-shrink: 0; font-size: 11px; }}
  .diff-prefix {{ width: 18px; text-align: center; padding: 2px 0; flex-shrink: 0; }}
  .diff-line-code {{ padding: 2px 8px; flex: 1; white-space: pre-wrap; color: var(--mate-frame-text); }}
  .diff-line.added {{ background: rgba(50,179,110,0.12); }} .diff-line.added .diff-prefix {{ color: var(--mate-success); }} .diff-line.added .diff-line-code {{ color: var(--mate-success); }}
  .diff-line.removed {{ background: rgba(245,70,81,0.12); }} .diff-line.removed .diff-prefix {{ color: var(--mate-error); }} .diff-line.removed .diff-line-code {{ color: var(--mate-error); }}
  .diff-line.context {{ background: transparent; }}

  .md-render {{ background: var(--mate-frame-sidebar); border: 1px solid var(--mate-frame-border); border-radius: 8px; padding: 20px 24px; max-height: 82vh; overflow-y: auto; color: var(--mate-frame-text); font-family: var(--mate-font-body); font-size: 14px; line-height: 1.6; }}
  .md-render h1, .md-render h2, .md-render h3 {{ font-family: var(--mate-font-display); color: var(--mate-frame-text); margin: 1.1em 0 0.4em; }}
  .md-render h2 {{ font-size: 1.15rem; border-bottom: 1px solid var(--mate-frame-border); padding-bottom: 4px; }}
  .md-render h2:first-child {{ margin-top: 0; }}
  .md-render p {{ margin: 0.5em 0; }}
  .md-render code {{ font-family: var(--mate-font-mono); background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }}
  .md-render a {{ color: var(--mate-primary); }}
  .md-render ul {{ margin: 0.4em 0 0.4em 1.2em; }}
  .md-render li {{ margin: 0.2em 0; }}
  .md-render input[type="checkbox"] {{ margin-right: 6px; }}
</style>
</head>
<body>
  <div class="page-wrap">
    <div class="topbar">
      <select id="theme-switcher" onchange="setTheme(this.value)"
        style="background: var(--mate-frame-nav); color: var(--mate-frame-text); border: 1px solid var(--mate-frame-border); border-radius: 6px; padding: 2px 8px; font-size: 13px; cursor: pointer;">
        <option value="mate">mate</option>
        <option value="mate-light">mate-light</option>
      </select>
    </div>
    <h1 style="font-family: var(--mate-font-display); font-size: 1.6rem; margin-bottom: 1rem; color: var(--mate-frame-text);">{html.escape(title)}</h1>
    <div class="columns">
      <div class="col">
        <div class="col-heading">Diff &mdash; {html.escape(old_path.split('/')[-1])} &rarr; {html.escape(new_path.split('/')[-1])}</div>
        <div class="diff-block">
          <div class="diff-file-header">
            <span>{html.escape(old_path.split('/')[-1])} &rarr; {html.escape(new_path.split('/')[-1])}</span>
            <span class="diff-stats"><span class="added">+{added}</span>&nbsp;<span class="removed">-{removed}</span></span>
          </div>
          {diff_html}
        </div>
      </div>
      <div class="col">
        <div class="col-heading">Full render &mdash; {html.escape(new_path.split('/')[-1])}</div>
        <div class="md-render" id="md-render"></div>
      </div>
    </div>
  </div>
  <script>
    function setTheme(name) {{ document.documentElement.setAttribute('data-theme', name); }}
    const rawMd = atob("{new_md_b64}");
    document.getElementById('md-render').innerHTML = marked.parse(rawMd, {{ gfm: true, breaks: false }});
  </script>
</body>
</html>
"""

with open(out_path, "w") as f:
    f.write(page)

print(out_path)
