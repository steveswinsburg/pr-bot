export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  /** Login of the GitHub App bot user (e.g. pr-bot[bot]). Used to ignore our own comments. */
  GITHUB_APP_SLUG?: string;
}
