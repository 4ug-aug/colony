import { RequestError, type Octokit } from "octokit";

export const FAILED_CONCLUSIONS = ["failure", "timed_out", "cancelled", "action_required"];

export const httpStatus = (error: unknown): number | undefined =>
  error instanceof RequestError ? error.status : undefined;

// 403/404 means the App lacks Checks: read.
const denied = (error: unknown) => [403, 404].includes(httpStatus(error) ?? 0);

type Repo = { owner: string; repo: string };
type Person = { login: string; type: string } | null;

export type Review = {
  id: number;
  author: Person;
  state: string;
  body: string;
  submittedAt: string;
  inlineComments: { id: number; path: string; line: number | null; body: string; diffHunk: string; createdAt: string }[];
};
export type Comment = { id: number; author: Person; body: string; createdAt: string };

/** Submitted reviews with their inline comments, and conversation comments, strictly after `since`. */
export async function readActivity(octokit: Octokit, repo: Repo, number: number, since?: string) {
  const { rest } = octokit;
  // ponytail: one page (100) per list; paginate if a pull request outgrows it.
  const [reviews, inline, comments] = await Promise.all([
    rest.pulls.listReviews({ ...repo, pull_number: number, per_page: 100 }),
    rest.pulls.listReviewComments({ ...repo, pull_number: number, since, per_page: 100 }),
    rest.issues.listComments({ ...repo, issue_number: number, since, per_page: 100 }),
  ]);
  const after = (time: string | null | undefined) =>
    since === undefined || Date.parse(time ?? "") > Date.parse(since);
  return {
    reviews: reviews.data.flatMap((review): Review[] =>
      review.state === "PENDING" || !review.submitted_at || !after(review.submitted_at)
        ? []
        : [{
            id: review.id,
            author: review.user,
            state: review.state,
            body: review.body ?? "",
            submittedAt: review.submitted_at,
            inlineComments: inline.data
              .filter((comment) => comment.pull_request_review_id === review.id)
              .map((comment) => ({
                id: comment.id,
                path: comment.path,
                line: comment.line ?? comment.original_line ?? null,
                body: comment.body,
                diffHunk: comment.diff_hunk,
                createdAt: comment.created_at,
              })),
          }],
    ),
    comments: comments.data
      .filter((comment) => after(comment.created_at))
      .map((comment): Comment => ({
        id: comment.id,
        author: comment.user,
        body: comment.body ?? "",
        createdAt: comment.created_at,
      })),
  };
}

export type FailedCheck = {
  id: number;
  name: string;
  conclusion: string;
  title?: string;
  summary?: string;
  detailsUrl?: string;
};

/** Failed runs are listed even while others still run; `pending` tells callers not to treat the commit as settled. */
export type Checks =
  | { kind: "unavailable" }
  | { kind: "pending"; failed: FailedCheck[] }
  | { kind: "settled"; runs: number; failed: FailedCheck[] };

export async function readChecks(octokit: Octokit, repo: Repo, sha: string): Promise<Checks> {
  let runs;
  try {
    runs = (await octokit.rest.checks.listForRef({ ...repo, ref: sha, per_page: 100 })).data.check_runs;
  } catch (error) {
    if (!denied(error)) throw error;
    return { kind: "unavailable" };
  }
  const failed = runs.flatMap((run): FailedCheck[] =>
    run.conclusion && FAILED_CONCLUSIONS.includes(run.conclusion)
      ? [{
          id: run.id,
          name: run.name,
          conclusion: run.conclusion,
          title: run.output.title ?? undefined,
          summary: run.output.summary ?? undefined,
          detailsUrl: run.details_url ?? undefined,
        }]
      : [],
  );
  return runs.every((run) => run.status === "completed")
    ? { kind: "settled", runs: runs.length, failed }
    : { kind: "pending", failed };
}

export async function readAnnotations(octokit: Octokit, repo: Repo, checkRunId: number) {
  try {
    return (await octokit.rest.checks.listAnnotations({ ...repo, check_run_id: checkRunId, per_page: 10 })).data;
  } catch (error) {
    if (!denied(error)) throw error;
    return [];
  }
}
