export function parseEmailFile(content: string): {
  valid: string[];
  invalid: number;
  duplicates: number;
} {
  const lines = content.split(/[\r\n]+/);
  const rawEmails: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (i === 0 && /^[a-zA-Z]/.test(line) && !line.includes("@")) continue;

    const parts = line.split(/[,\t;|]+/);
    for (const part of parts) {
      const cleaned = part.trim().replace(/^["']|["']$/g, "");
      rawEmails.push(cleaned);
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validSet = new Set<string>();
  let invalid = 0;
  let duplicates = 0;

  for (const email of rawEmails) {
    if (!email || !emailRegex.test(email)) {
      invalid++;
      continue;
    }
    const lower = email.toLowerCase();
    if (validSet.has(lower)) {
      duplicates++;
    } else {
      validSet.add(lower);
    }
  }

  return {
    valid: Array.from(validSet),
    invalid,
    duplicates,
  };
}
