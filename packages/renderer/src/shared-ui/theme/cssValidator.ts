const URL_PATTERN = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;

/** Devuelve las URLs externas no permitidas encontradas en el CSS. */
export function findInvalidCssUrls(css: string): string[] {
  const invalid: string[] = [];
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(css)) !== null) {
    const url = (match[2] ?? '').trim();
    if (!url.startsWith('data:') && !url.startsWith('vela:')) {
      invalid.push(url);
    }
  }
  return invalid;
}

export function validateCustomCss(css: string): { valid: boolean; invalidUrls: string[] } {
  const invalidUrls = findInvalidCssUrls(css);
  return { valid: invalidUrls.length === 0, invalidUrls };
}
