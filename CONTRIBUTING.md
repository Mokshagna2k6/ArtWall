# How we work on ArtWall

Agreed 22 November 2026, after `main` had drifted six weeks behind the
deployed code and 45 commits existed only on one laptop. The point of this
file is that neither happens again.

## The repositories

| Remote | Repository | What it is |
|---|---|---|
| `upstream` | `stackfoxtech-maker/ArtWall` | **Canonical.** The source of truth. Nothing is pushed straight to its `main`. |
| `origin` | `Mokshagna2k6/ArtWall` | A fork of `upstream`. All work starts here. |

`im-alok74/ArtWall` is no longer part of this project. The fork used to be
parented to it, which is why pull requests defaulted to the wrong repository;
it was re-forked from `stackfoxtech-maker` to fix that.

If `git remote -v` does not show exactly the two remotes above:

```bash
git remote set-url origin   https://github.com/Mokshagna2k6/ArtWall.git
git remote set-url upstream https://github.com/stackfoxtech-maker/ArtWall.git
```

## The flow

```
upstream/main  ──fork──▶  origin  ──branch──▶  work  ──PR──▶  upstream/main
```

1. **Start from a current `main`.**
   ```bash
   git checkout main
   git pull upstream main
   ```

2. **Branch for the one thing you are about to do.**
   ```bash
   git checkout -b fix/artwork-404-on-alias
   ```

3. **Commit as you go.** Present tense, say what changed and why. If the
   reason is not obvious from the diff, the message is where it goes.

4. **Push to your fork, never to upstream.**
   ```bash
   git push -u origin fix/artwork-404-on-alias
   ```

5. **Open a PR into `upstream/main`.**
   ```bash
   gh pr create --repo stackfoxtech-maker/ArtWall --base main
   ```

6. **Merge once CI is green.** If something must merge red, say so in a
   comment on the PR: which checks, why it is acceptable, and when it will be
   fixed. A red check that nobody has written down is the thing this file
   exists to prevent.

7. **Clean up.**
   ```bash
   git checkout main && git pull upstream main
   git branch -d fix/artwork-404-on-alias
   git push origin --delete fix/artwork-404-on-alias
   ```

## Branch names

`<type>/<what-it-does>` — short, lowercase, hyphenated.

`feat/` new capability · `fix/` a bug · `refactor/` no behaviour change ·
`chore/` tooling, deps, config · `docs/` documentation only ·
`release/` a catch-up or release branch

Good: `fix/mobile-menu-invisible-labels`, `feat/wall-manager-pricing`
Bad: `phase-3-complete-latest2`, `review/all-phases`, `worktree-agent-af218`

A name should say what changed. "latest", "now", "complete" and "final" say
nothing and stop meaning anything the moment a second one exists.

## Commits

Authored by **Mokshagna \<stackfox.tech@gmail.com\>** and nobody else. No
`Co-Authored-By` trailers, no tool attribution, in commits or PR descriptions.

## Before you open a PR

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

`pnpm build` is not optional. `tsc --noEmit` passes on a Client Component that
imports from a Server Component file, and that combination breaks the real
Next.js build — see `AGENTS.md`.

Migrations: verify against a disposable Postgres before they reach a real
database.

```bash
docker run -d -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17
DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres \
  node packages/db/scripts/migrations-check.mjs
```

Every migration must apply **twice** without error (DB-2.13). A rename or a
`create index` on a column a later migration renames needs an existence guard
— see `0003_studio.sql` for the pattern.

## Deployment

Production currently deploys from this machine with `vercel --prod`, not from
a GitHub push. So merging to `main` does **not** deploy, and deploying does
**not** update `main`. Keep both in step until that is wired up, or the repo
stops being an honest record of what is live.
