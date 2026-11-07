import type { Octokit } from "@octokit/rest";

export async function rerunPullRequestWorkflows(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
  failedOnly: boolean,
): Promise<string> {
  const { data } = await octokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    head_sha: headSha,
    per_page: 10,
  });

  const runs = data.workflow_runs;
  if (!runs.length) {
    return `No GitHub Actions workflow runs found for commit \`${headSha.slice(0, 7)}\`.`;
  }

  const latest = runs.reduce((a, b) =>
    new Date(a.created_at) >= new Date(b.created_at) ? a : b,
  );

  if (failedOnly) {
    if (latest.conclusion !== "failure" && latest.conclusion !== "cancelled") {
      return `Latest run [#${latest.run_number}](${latest.html_url}) did not fail (status: ${latest.status}, conclusion: ${latest.conclusion ?? "none"}). Use \`@prbot rerun\` to re-run either way.`;
    }
    await octokit.actions.reRunWorkflowFailedJobs({
      owner,
      repo,
      run_id: latest.id,
    });
    return `Re-running **failed jobs** on workflow run [#${latest.run_number}](${latest.html_url}).`;
  }

  await octokit.actions.reRunWorkflow({
    owner,
    repo,
    run_id: latest.id,
  });
  return `Re-running workflow [#${latest.run_number}](${latest.html_url}) for commit \`${headSha.slice(0, 7)}\`.`;
}
