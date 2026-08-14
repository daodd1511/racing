# Marble Race Picker

A hosted static page that picks a person at random from a pasted list and
reveals the result as a one-minute 3D marble race down a physical raceway.
Physics decides the winner — no pre-drawn result, no rigged race.

## Local commands

```
pnpm install
pnpm dev            # local dev server
pnpm typecheck       # tsc -b
pnpm lint            # oxlint src
pnpm format          # oxfmt --write .
pnpm format:check    # oxfmt --check .
pnpm test            # vitest run
pnpm build           # production build to dist/
pnpm preview         # serve the production build locally
```

## First / Last semantics

A setting on the setup screen chooses how the race result is read, and
persists in `localStorage`:

- **First** (default) — the first marble to cross the finish line is selected.
  The race recording ends at that crossing.
- **Last** — the final marble to cross the finish line is selected. The race
  continues until every marble has finished.

The result label ("Winner", "Unlucky", …) is a config string, so the same
mechanic reads as either framing depending on how the team wants to present
it.

## Data handling

Everything runs client-side. There is no backend, no database, no accounts.

- The roster (pasted names) and past race history persist in `localStorage`
  on the machine running the page — nothing else.
- Names never leave the browser. No race data is transmitted over the
  network at any point, including during the race itself.
- A "copy list" button lets the host hand the roster to someone else (e.g.
  via Slack) without the app doing any network transmission on its own.

## Screen-share audio

Race audio (collision sounds plus a finish sting) is **muted by default**.
Browser autoplay policy requires a user gesture before audio can play
regardless, and audio that's loud for the host and silent for everyone else
on a call is worse than silence — so the mute default holds until the host
explicitly enables it via the visible toggle. If you want the room to hear
it, enable the toggle and make sure your screen-share includes tab/system
audio (in Meet: "Share tab audio"; in Zoom: "Share sound").

## Deployment

The app deploys to GitHub Pages via `.github/workflows/deploy-pages.yml` on
every push to `main`: install, typecheck, lint, format check, test, build,
then upload and deploy `dist/`.

One-time repository setup, before the first deploy:

1. **Settings → Pages → Build and deployment → Source**: select **GitHub
   Actions** (not "Deploy from a branch").
2. No further configuration needed — the workflow requests only the
   `pages: write` and `id-token: write` permissions it needs, scoped to the
   `github-pages` deployment environment.

The production build uses a relative asset base (`vite.config.ts`), so it
works unmodified at the repository subpath GitHub Pages serves it from
(`https://<owner>.github.io/<repo>/`) without hardcoding the repository name
anywhere.
