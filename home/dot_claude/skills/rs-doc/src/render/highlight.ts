import hljs from "highlight.js";

// Build-time syntax highlighting only, no client-side JS ships for this. hljs.highlight()
// returns HTML with entities already escaped, so callers must not re-escape the result.
export function highlightCode(code: string, lang?: string): { html: string; language?: string } {
  try {
    if (lang && hljs.getLanguage(lang)) {
      const result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
      return { html: result.value, language: lang };
    }
    const auto = hljs.highlightAuto(code);
    return { html: auto.value, language: auto.language };
  } catch {
    return { html: escapeForFallback(code) };
  }
}

function escapeForFallback(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
