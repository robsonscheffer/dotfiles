# Changelog entry shape

`@<handle>: changelog` (`INTAKE_PAGE`) is an index page. Each week is a child page,
`@<handle>: changelog semana <n>`, and the index lists it at the top of its "## Semanas" section.
It is a quick capture of what the week produced, not a plan: the weekly plan picks from it. The
draft is Markdown in pt-BR (the content plan is in pt-BR). Its first line becomes the page's
"Período" line and the index link; the rest is the page body.

```markdown
## Semana <n> (<dd/mm> a <dd/mm/yyyy>)

**Destaques**
- <what happened, one line> ([prova](link)) · <pilar>

**Também**
- <one line> ([prova](link)) · <pilar>

**Revisar** (só título, entra na pauta só com o OK do Robson)
- <title>
```

Limits, to keep the noise down: 3 to 5 destaques, at most 5 "também", at most 5 "revisar".
Merge items about the same thing into one line.

Leave out: "descartar" items, voice notes that are not ideas, names of people who did not agree to
appear, and links to local files (a Wiki reader cannot open them). Omit an empty section.

`n` is the ISO week of the collected days. Dates `dd/mm/yyyy`. No em-dashes.
