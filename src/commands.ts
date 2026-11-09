export type BotCommand =
  | { kind: "help" }
  | { kind: "rebase" }
  | { kind: "rerun"; failedOnly: boolean }
  | { kind: "ready" }
  | { kind: "draft" }
  | { kind: "status" };

const MENTION = /@prbot\b/i;

export function parseCommand(body: string): BotCommand | null {
  const trimmed = body.trim();
  if (!MENTION.test(trimmed)) return null;

  const afterMention = trimmed.replace(MENTION, "").trim();
  const tokens = afterMention.split(/\s+/).filter(Boolean);
  const verb = tokens[0]?.toLowerCase();
  if (!verb) return { kind: "help" };

  switch (verb) {
    case "help":
      return { kind: "help" };
    case "rebase":
      return { kind: "rebase" };
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
    default:
      return null;
  }
}

export const HELP_TEXT = `**PR Bot** commands (use \`@prbot <command>\` on this PR):

- \`@prbot rebase\` - rebase this branch onto the latest base
- \`@prbot rerun\` - re-run the latest GitHub Actions workflow for this PR
- \`@prbot rerun failed\` - re-run only failed jobs on the latest run
- \`@prbot ready\` - mark a draft PR ready for review
- \`@prbot draft\` - convert an open PR back to draft
- \`@prbot status\` - table of merge state, checks, reviews, and branch
- \`@prbot help\` - show this message`;
