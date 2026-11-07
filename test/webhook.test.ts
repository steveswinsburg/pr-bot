import { describe, expect, it } from "vitest";
import { verifyGitHubWebhookSignature } from "../src/webhook.js";

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

describe("verifyGitHubWebhookSignature", () => {
  it("accepts valid signatures", async () => {
    const body = '{"zen":"Keep it logically awesome."}';
    const header = await sign("my-secret", body);
    await expect(
      verifyGitHubWebhookSignature("my-secret", body, header),
    ).resolves.toBe(true);
  });

  it("rejects wrong secret", async () => {
    const body = "{}";
    const header = await sign("other", body);
    await expect(
      verifyGitHubWebhookSignature("my-secret", body, header),
    ).resolves.toBe(false);
  });

  it("rejects missing header", async () => {
    await expect(
      verifyGitHubWebhookSignature("s", "{}", null),
    ).resolves.toBe(false);
  });
});
