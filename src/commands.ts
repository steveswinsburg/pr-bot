export type BotCommand =
  | { kind: "help" }
  | { kind: "rebase" }
  | { kind: "resolve"; strategy: "merge" | "ours" | "theirs" }
  | { kind: "rerun"; failedOnly: boolean }
  | { kind: "ready" }
  | { kind: "draft" }
  | { kind: "status" }
  | { kind: "commits" }
  | { kind: "changelog" }
  | { kind: "diff" }
  | { kind: "lock"; locked: boolean }
  | { kind: "update" }
  | { kind: "merge"; bypass: boolean; mergeMethod?: "merge" | "squash" | "rebase" };

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Leading @prbot (and optional app slug) only - avoids parsing our help replies. */
export function commandMentionPattern(appSlug?: string): RegExp {
  const names = ["prbot"];
  if (appSlug) {
    const slug = appSlug.toLowerCase();
    if (!names.includes(slug)) names.push(slug);
  }
  const alternation = names.map(escapeRegexLiteral).join("|");
  return new RegExp(`^@(?:${alternation})(?:\\[bot\\])?(?=\\s|$)`, "i");
}

function parseMergeMethod(
  token: string | undefined,
): "merge" | "squash" | "rebase" | undefined {
  if (token === "merge" || token === "squash" || token === "rebase") {
    return token;
  }
  return undefined;
}

function parseMergeOptions(
  rest: string[],
  bypass: boolean,
): { kind: "merge"; bypass: boolean; mergeMethod?: "merge" | "squash" | "rebase" } {
  let mergeMethod: "merge" | "squash" | "rebase" | undefined;
  for (const raw of rest) {
    const method = parseMergeMethod(raw.toLowerCase());
    if (method) mergeMethod = method;
  }
  if (bypass && mergeMethod === undefined) {
    mergeMethod = "squash";
  }
  return { kind: "merge", bypass, mergeMethod };
}

export function parseCommand(
  body: string,
  options?: { appSlug?: string },
): BotCommand | null {
  const trimmed = body.trim();
  const mention = commandMentionPattern(options?.appSlug);
  const match = mention.exec(trimmed);
  if (!match) return null;

  const afterMention = trimmed.slice(match[0].length).trim();
  const tokens = afterMention.split(/\s+/).filter(Boolean);
  let verb = tokens[0]?.toLowerCase();
  if (verb?.startsWith("/")) verb = verb.slice(1);
  if (!verb) return { kind: "help" };

  switch (verb) {
    case "help":
      return { kind: "help" };
    case "rebase":
      return { kind: "rebase" };
    case "resolve": {
      const sub = tokens[1]?.toLowerCase();
      if (sub === "ours") return { kind: "resolve", strategy: "ours" };
      if (sub === "theirs") return { kind: "resolve", strategy: "theirs" };
      return { kind: "resolve", strategy: "merge" };
    }
    case "rerun": {
      const sub = tokens[1]?.toLowerCase();
      return { kind: "rerun", failedOnly: sub === "failed" };
    }
    case "ready":
      return { kind: "ready" };
    case "draft":
      return { kind: "draft" };
    case "status":
      return { kind: "status" };
    case "commits":
      return { kind: "commits" };
    case "changelog":
      return { kind: "changelog" };
    case "diff":
      return { kind: "diff" };
    case "lock":
      return { kind: "lock", locked: true };
    case "unlock":
      return { kind: "lock", locked: false };
    case "update":
      return { kind: "update" };
    case "force-merge":
      return parseMergeOptions(tokens.slice(1), true);
    case "merge":
      return parseMergeOptions(tokens.slice(1), false);
    default:
      return null;
  }
}

export const HELP_TEXT = `**PR Bot** commands (use \`@prbot <command>\` on this PR):

- \`@prbot rebase\` - rebase this branch onto the latest base
- \`@prbot resolve\` - merge the latest base into this branch (GitHub “Update branch”); on conflicts, try automatic resolution favoring this branch
- \`@prbot resolve ours\` - merge base into head; on overlapping changes, keep the PR branch version
- \`@prbot resolve theirs\` - merge base into head; on overlapping changes, keep the base version
- \`@prbot rerun\` - re-run the latest GitHub Actions workflow for this PR
- \`@prbot rerun failed\` - re-run only failed jobs on the latest run
- \`@prbot ready\` - mark a draft PR ready for review
- \`@prbot draft\` - convert an open PR back to draft
- \`@prbot status\` - table of merge state, checks, reviews, and branch
- \`@prbot commits\` - short sha and subject for PR commits (up to 20)
- \`@prbot changelog\` - bullet list of commit messages on this branch vs base
- \`@prbot diff\` - short summary vs base: files, line counts, top paths
- \`@prbot lock\` - lock the PR conversation
- \`@prbot unlock\` - unlock the PR conversation
- \`@prbot update\` - merge the latest base branch into this PR (when behind)
- \`@prbot merge\` - merge this PR when repository rules are satisfied (optional: \`squash\`, \`rebase\`, or \`merge\`)
- \`@prbot force-merge\` - merge while bypassing rules the **GitHub App** is allowed to bypass (defaults to **squash**; optional: \`merge\` or \`rebase\`)
- \`@prbot help\` - show this message`;