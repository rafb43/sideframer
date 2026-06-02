# sideframer — agent notes

## Always commit and push before ending a session

When you finish a task in this repo, **commit and push** before you stop — even if the user didn't ask explicitly. Long-running uncommitted edits in a fresh working tree have caused two recurring problems here:

1. **Unclean worktrees.** The next session inherits a pile of `M` files from work it didn't do, so `git status` no longer reflects what is in flight. Diagnostics drift; small changes get lost in the noise.
2. **Stale worktrees.** When a parallel agent (or `EnterWorktree`) branches off `main`, it picks up the last *pushed* state. Uncommitted local work doesn't make it across, the new branch silently regresses, and merges later become painful.

Concretely, at the end of any task that touched code:

- `git status` should be clean (or only contain files the user explicitly told you to leave alone).
- The branch should be pushed: `git push` (or `git push -u origin <branch>` on first push).
- If a task is genuinely incomplete and you must stop mid-flight, commit the partial work to a WIP branch and push it — do not leave it sitting unstaged.

The only reasons to skip this: the user explicitly says "don't commit", or you're in a read-only/research session that produced no edits.

## Transient artifacts (do not commit)

`.claude/`, `.playwright-mcp/`, and root-level `*.png` screenshots are agent/tooling scratch and are gitignored. If you need to share a screenshot with the user, drop it at the repo root — it won't end up in a commit.
