import type { Env } from "./env.js";
import { handleIssueComment } from "./issue-comment.js";
import { verifyGitHubWebhookSignature } from "./webhook.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("PR Bot — POST GitHub webhooks to /github/webhook", {
        status: 200,
      });
    }

    if (request.method !== "POST" || url.pathname !== "/github/webhook") {
      return new Response("Not found", { status: 404 });
    }

    const delivery = request.headers.get("X-GitHub-Delivery") ?? "unknown";
    const event = request.headers.get("X-GitHub-Event");
    const signature = request.headers.get("X-Hub-Signature-256");
    const payloadText = await request.text();

    const valid = await verifyGitHubWebhookSignature(
      env.GITHUB_WEBHOOK_SECRET,
      payloadText,
      signature,
    );
    if (!valid) {
      console.warn(JSON.stringify({ delivery, event, error: "invalid_signature" }));
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      if (event === "issue_comment") {
        await handleIssueComment(env, payload as Parameters<typeof handleIssueComment>[1]);
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          delivery,
          event,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return new Response("Webhook handler error", { status: 500 });
    }

    console.log(JSON.stringify({ delivery, event, status: "ok" }));
    return new Response("OK", { status: 200 });
  },
} satisfies import("@cloudflare/workers-types").ExportedHandler<Env>;
