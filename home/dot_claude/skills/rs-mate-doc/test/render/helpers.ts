// Hand-built AST fixtures against src/types.ts. The parser (L1) isn't ready yet, so tests
// construct nodes directly instead of parsing markdown.

import type {
  Block,
  Claim,
  ClaimId,
  ClaimRefNode,
  CodeBlockNode,
  Doc,
  DirectiveNode,
  Frontmatter,
  HeadingNode,
  HeadingRef,
  Inline,
  Ledger,
  LinkKind,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  Pos,
  Span,
  TableNode,
} from "../../src/types.ts";

export const pos = (line = 1, column = 1): Pos => ({ line, column });
export const span = (): Span => ({ start: pos(), end: pos() });

export const text = (value: string): Inline => ({ type: "text", value, pos: span() });
export const strong = (...children: Inline[]): Inline => ({ type: "strong", children, pos: span() });
export const emphasis = (...children: Inline[]): Inline => ({ type: "emphasis", children, pos: span() });
export const inlineCode = (value: string): Inline => ({ type: "inlineCode", value, pos: span() });
export const claimRef = (id: ClaimId): ClaimRefNode => ({ type: "claimRef", id, pos: span() });
export const link = (kind: LinkKind, target: string, ...children: Inline[]): LinkNode => ({
  type: "link",
  kind,
  target,
  children: children.length ? children : [text(target)],
  pos: span(),
});

export const para = (...children: Inline[]): ParagraphNode => ({ type: "paragraph", children, pos: span() });

export const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, id: string, value: string): HeadingNode => ({
  type: "heading",
  level,
  id,
  children: [text(value)],
  pos: span(),
});

export const listItem = (...children: Block[]): ListItemNode => ({ type: "listItem", children, pos: span() });
export const list = (ordered: boolean, ...children: ListItemNode[]): ListNode => ({
  type: "list",
  ordered,
  children,
  pos: span(),
});

export const codeBlock = (value: string, lang?: string, meta: Record<string, string> = {}): CodeBlockNode => ({
  type: "code",
  lang,
  meta,
  value,
  pos: span(),
});

export const table = (
  head: Inline[][],
  rows: Inline[][][],
  align: (TableNode["align"][number])[] = head.map(() => null),
): TableNode => ({ type: "table", head, rows, align, pos: span() });

export const directive = (
  name: string,
  opts: { known?: boolean; args?: string[]; children?: Block[]; raw?: string[] } = {},
): DirectiveNode => ({
  type: "directive",
  name,
  known: opts.known ?? true,
  args: opts.args ?? [],
  children: opts.children ?? [],
  raw: opts.raw,
  pos: span(),
});

export function makeDoc(body: Block[], frontmatter: Partial<Frontmatter> = {}, headings: HeadingRef[] = []): Doc {
  return {
    path: "test.md",
    frontmatter: { extra: {}, ...frontmatter },
    body,
    headings,
    claimRefs: [],
    errors: [],
  };
}

export function makeClaim(overrides: Partial<Claim> & { id: ClaimId }): Claim {
  return {
    claim: "A claim.",
    status: "verified",
    ...overrides,
  } as Claim;
}

export function makeLedger(claims: Claim[]): Ledger {
  return { path: "claims.yaml", claims };
}
