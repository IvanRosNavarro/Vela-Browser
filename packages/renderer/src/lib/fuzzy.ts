export interface FuzzyMatch {
  match: boolean;
  score: number;
  positions: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch {
  if (!query) return { match: true, score: 0, positions: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t === q) return { match: true, score: 10000, positions: [...Array(t.length).keys()] };

  if (t.startsWith(q)) {
    return { match: true, score: 5000, positions: [...Array(q.length).keys()] };
  }

  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    const positions = Array.from({ length: q.length }, (_, i) => subIdx + i);
    return { match: true, score: 3000 - subIdx * 10, positions };
  }

  const positions: number[] = [];
  let score = 0;
  let qi = 0;
  let consecutive = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      positions.push(ti);
      consecutive = lastMatchIdx === ti - 1 ? consecutive + 1 : 1;
      score += consecutive * 10;
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === ':' || t[ti - 1] === '/') {
        score += 15;
      }
      lastMatchIdx = ti;
      qi++;
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return { match: false, score: 0, positions: [] };

  score -= (t.length - q.length) * 0.5;
  return { match: true, score: Math.max(score, 1), positions };
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getTargets: (item: T) => string | string[],
): Array<T & { _score: number; _positions: number[] }> {
  if (!query) return items.map((i) => ({ ...i, _score: 0, _positions: [] }));

  return items
    .map((item) => {
      const raw = getTargets(item);
      const targets = Array.isArray(raw) ? raw : [raw];
      const best = targets.reduce<FuzzyMatch>(
        (prev, t) => {
          const r = fuzzyMatch(query, t);
          return r.score > prev.score ? r : prev;
        },
        { match: false, score: 0, positions: [] },
      );
      return { ...item, _score: best.score, _positions: best.positions };
    })
    .filter((i) => i._score > 0)
    .sort((a, b) => b._score - a._score);
}

export function highlightMatch(
  text: string,
  positions: number[],
): Array<{ text: string; highlighted: boolean }> {
  const posSet = new Set(positions);
  const result: Array<{ text: string; highlighted: boolean }> = [];
  let current = '';
  let isHighlighted = false;

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = posSet.has(i);
    if (shouldHighlight !== isHighlighted) {
      if (current) result.push({ text: current, highlighted: isHighlighted });
      current = text[i] ?? '';
      isHighlighted = shouldHighlight;
    } else {
      current += text[i];
    }
  }
  if (current) result.push({ text: current, highlighted: isHighlighted });
  return result;
}
