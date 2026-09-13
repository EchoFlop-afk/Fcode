export type DiffLine = {
  type: "same" | "add" | "del";
  text: string;
  oldLine?: number;
  newLine?: number;
};

/**
 * Line-based diff via LCS. Produces a full sequence (not hunks) which the
 * diff viewer renders with context elision. Caps input to keep it fast.
 */
export function diffLines(
  oldText: string,
  newText: string,
  maxLines = 4000
): DiffLine[] {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];

  // For very large files, degrade to a whole-file replace marker.
  if (a.length > maxLines || b.length > maxLines) {
    return [
      { type: "del", text: `(original file: ${a.length} lines)`, oldLine: 1 },
      { type: "add", text: `(new file: ${b.length} lines)`, newLine: 1 },
    ];
  }

  const n = a.length;
  const m = b.length;
  // LCS table (n+1)*(m+1)
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ type: "add", text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < n) {
    out.push({ type: "del", text: a[i], oldLine: i + 1 });
    i++;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j], newLine: j + 1 });
    j++;
  }
  return out;
}

/** Collapses long runs of unchanged lines around changes. */
export function elideContext(lines: DiffLine[], context = 3): (DiffLine | { type: "gap"; count: number })[] {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.type !== "same") {
      for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
        keep[k] = true;
      }
    }
  });
  const out: (DiffLine | { type: "gap"; count: number })[] = [];
  let gap = 0;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (gap > 0) {
        out.push({ type: "gap", count: gap });
        gap = 0;
      }
      out.push(l);
    } else {
      gap++;
    }
  });
  if (gap > 0) out.push({ type: "gap", count: gap });
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === "add") added++;
    else if (l.type === "del") removed++;
  }
  return { added, removed };
}
