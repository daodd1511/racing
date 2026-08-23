# Marble Race Picker

A hosted static page that picks a person at random from a pasted list and
reveals the result as a 3D marble race down a physical raceway.
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

## Production flow

`index.html` mounts the React picker. Paste a Roster of 1–15 names, choose
**First** or **Last**, and start the race. The same seeded physical Course
drives the live viewport, minimap, and standings; it does not preselect a
result.

On a completed race, the Course freezes immediately, the selected name is
recorded once, and the result appears after a short reveal delay. If the
watchdog reaches its simulation limit, the app records no result and offers a
new-seed retry or a return to setup.

## Development pages

Run `pnpm dev`, then use these entry pages:

- `/` — production picker.
- `/showcase.html` — Module tuning Showcase.
- `/course.html` — fixed 15-marble Course review harness.

The two development pages are intentionally separate from the production
picker. They are included in the production build for review, not linked from
the picker flow.

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

- The Roster, selection mode, and committed race history persist in
  `localStorage` on the machine running the page — nothing else.
- A watchdog run never creates a history entry.
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

## GitHub Pages deployment and verification

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

Before merging a deployment change:

1. Run `pnpm build` and `pnpm preview`.
2. Open `/`, `/showcase.html`, and `/course.html`; refresh each URL directly.
3. After GitHub Pages deploys `main`, open the production URL and refresh it
   directly to confirm the picker still loads at the repository subpath.
