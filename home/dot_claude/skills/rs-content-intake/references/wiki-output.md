# Draft and Wiki page shape

The draft and the Wiki page are the same Markdown, in pt-BR (the content plan is in pt-BR).

Title: `@<handle>: material semana <n>` (n = ISO week of the collected days). Parent: the brand's
`@<handle>: materiais` page (`INTAKE_PARENT_DOC`). The weekly plan skill reads the materials page
and its children.

```markdown
**Semana:** <n> (<dd/mm> a <dd/mm/yyyy>) · **Status:** rascunho · **Itens:** <in> lidos, <blocked> bloqueados

Para enviar: apague o que não serve, troque "revisar" por "manter" no que pode ir, e diga "send".

## Destaques

| Tema | O que aconteceu | Prova | Pilar sugerido |
|------|-----------------|-------|----------------|
| brasildb | ... | link or number | Dados públicos |

## Por tema

### <tema>

| Item | Prova | Pilar | Veredito |
|------|-------|-------|----------|
| ... | ... | ... | manter / revisar / descartar: <why> |

## Ideias por voz

| Data | Ideia | Veredito |
|------|-------|----------|
```

Rules: dates `dd/mm/yyyy`; no em-dashes; a `review` item shows its title only; links to local
files stay out of the Wiki version (write the file name in the draft, drop it before sending).
