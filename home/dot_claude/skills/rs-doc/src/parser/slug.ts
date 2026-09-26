// Heading id generation: lowercase, hyphenated, de-duplicated within a document.

export class SlugGenerator {
  private used = new Map<string, number>();

  slug(text: string): string {
    const base =
      text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    const seen = this.used.get(base) ?? 0;
    this.used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  }
}
