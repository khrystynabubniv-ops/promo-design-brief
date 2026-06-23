export type LintMatch = {
  start: number;
  end: number;
  term: string;
  reason: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseForbiddenTerm(value: string) {
  const [term, ...reasonParts] = value.split('::');

  return {
    term: term.trim(),
    reason: reasonParts.join('::').trim() || 'Заборонене або небажане формулювання для цього формату.',
  };
}

export function lint(text: string, forbidden: string[]): LintMatch[] {
  return forbidden
    .map(parseForbiddenTerm)
    .filter(({ term }) => Boolean(term))
    .flatMap(({ term, reason }) => {
      const matches: LintMatch[] = [];
      const pattern = new RegExp(escapeRegExp(term), 'giu');
      let match = pattern.exec(text);

      while (match) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          term: match[0],
          reason,
        });
        match = pattern.exec(text);
      }

      return matches;
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);
}
