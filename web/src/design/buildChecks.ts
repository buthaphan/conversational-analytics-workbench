/** Text that only the development reference page contains; must never reach a production build. */
export const REFERENCE_PAGE_MARKER = "cawb-design-reference-page";

export interface BuildFile {
  /** Path relative to the build output directory, using forward slashes. */
  path: string;
  /** File contents for text files; empty for binary files. */
  text: string;
}

const EXTERNAL_FONT_HOST =
  /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net|[^"'\s)]*fontawesome)/i;
/** `@import "https://…"`, `@import url(//…)`. */
const EXTERNAL_CSS_IMPORT = /@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\//i;
/** Any CSS `url()` pointing off-origin, including protocol-relative. */
const EXTERNAL_CSS_URL = /url\(\s*["']?(?:https?:)?\/\//i;
/** Any HTML `src` or `href` pointing off-origin, including protocol-relative. */
const EXTERNAL_HTML_REF = /\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i;

function externalReference(path: string, text: string): boolean {
  if (path.endsWith(".css")) return EXTERNAL_CSS_IMPORT.test(text) || EXTERNAL_CSS_URL.test(text);
  if (path.endsWith(".html")) return EXTERNAL_HTML_REF.test(text);
  return false;
}

/**
 * Returns human-readable problems with a production build; empty when the build is acceptable.
 * `requiredColorTokens` are token names (without `--color-`) that the built CSS must define.
 */
export function findBuildProblems(
  files: BuildFile[],
  requiredColorTokens: string[] = [],
): string[] {
  const problems: string[] = [];

  if (!files.some((f) => /\.woff2$/.test(f.path))) {
    problems.push("No bundled .woff2 font file found in the build output.");
  }

  for (const { path, text } of files) {
    if (EXTERNAL_FONT_HOST.test(text)) {
      problems.push(`${path}: references an external font host.`);
    } else if (externalReference(path, text)) {
      problems.push(`${path}: loads an external stylesheet, script, font, or other resource.`);
    }
    if (text.includes(REFERENCE_PAGE_MARKER)) {
      problems.push(`${path}: contains the development-only reference page.`);
    }
  }

  const css = files
    .filter((f) => f.path.endsWith(".css"))
    .map((f) => f.text)
    .join("\n");
  for (const name of requiredColorTokens) {
    if (!new RegExp(`--color-${name}\\s*:`).test(css)) {
      problems.push(`Built CSS does not define --color-${name}.`);
    }
  }

  return problems;
}
