export type TextMeasure = (text: string) => number;

function ellipsize(text: string, maxWidth: number, measure: TextMeasure) {
  const ellipsis = '…';
  if (measure(ellipsis) > maxWidth) return '';
  const characters = Array.from(text.trimEnd());
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${characters.slice(0, middle).join('')}${ellipsis}`) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, low).join('')}${ellipsis}`;
}

export function wrapTextWithEllipsis(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: TextMeasure,
) {
  if (!text || maxWidth <= 0 || maxLines <= 0) return '';
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '';

  const lines: string[] = [];
  let current = '';
  let truncated = false;

  const pushLine = (line: string) => {
    if (lines.length === maxLines) {
      truncated = true;
      return false;
    }
    lines.push(line);
    return true;
  };

  outer: for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      if (!pushLine(current)) break;
      current = '';
    }
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }

    let remaining = Array.from(word);
    while (remaining.length > 0) {
      let chunk = '';
      let consumed = 0;
      for (const character of remaining) {
        if (measure(`${chunk}${character}`) > maxWidth) break;
        chunk += character;
        consumed++;
      }
      if (consumed === 0) {
        truncated = true;
        break outer;
      }
      remaining = remaining.slice(consumed);
      if (remaining.length === 0) {
        current = chunk;
      } else if (!pushLine(chunk)) {
        break outer;
      }
    }
  }

  if (current) {
    if (!pushLine(current)) truncated = true;
  }
  if (lines.length === 0) return '';

  if (truncated) lines[lines.length - 1] = ellipsize(lines.at(-1)!, maxWidth, measure);
  return lines.join('\n');
}
