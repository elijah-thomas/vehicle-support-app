// Deterministic grading: every check is a pattern a reviewer can read. No LLM judge.

// cuid() IDs from Postgres. The model never sees them, so one in an answer means a leak.
const INTERNAL_ID = /\bc[a-z0-9]{24}\b/;

export type TextChecks = { include?: RegExp[]; exclude?: RegExp[] };

export function checkText(text: string, { include = [], exclude = [] }: TextChecks): string[] {
  const failures: string[] = [];
  for (const pattern of include) if (!pattern.test(text)) failures.push(`missing ${pattern}`);
  for (const pattern of [...exclude, INTERNAL_ID]) {
    const match = text.match(pattern);
    if (match) failures.push(`forbidden ${pattern} matched "${match[0]}"`);
  }
  return failures;
}

export function checkTools(called: string[], expected: string[]): string[] {
  return expected.filter((name) => !called.includes(name)).map((name) => `did not call ${name}`);
}
