# Blog engineering contract

## Publication boundary
The author explicitly authorized this site's public repository and Pages deployment. Only ChengzhiHuang/ChengzhiHuang.github.io main is permitted. Keep the checked pre-push hook enabled: approved article hashes, a clean verified commit and an audit of outgoing history are required. Never force-push, delete a remote branch or bypass checks. Only .github/workflows/pages.yml may deploy, and only dist is uploaded. Raw sources, review comparisons and private tooling remain outside the checkout. Other remote writes and public preview tunnels are not authorized.

## Ownership
- src/content/posts: approved, sanitized articles and their local images only.
- src/lib: shared content model and indexing, used by all public surfaces.
- src/components and src/layouts: presentation; browser code cannot import Node APIs.
- scripts: deterministic local checks, build orchestration and packaging.
- tests: synthetic/public fixtures only.
- .harness: ignored local evidence; never part of dist.

## Workflow
Read README.md for setup and commands. Run harness:check for a focused edit, harness:verify for full verification, and harness:package only after approved content hashes match. Missing/skipped required checks must not pass packaging. Keep behavioral docs and ADRs current. Never weaken a check to hide a failure.

No build may read outside this checkout or fetch article content. Pending drafts are previewed in a separate private copy, not injected into this checkout. Dependencies are installed separately.

