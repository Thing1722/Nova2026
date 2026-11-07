# ShiftChef AI — Shared Agent Instructions

ShiftChef AI is a restaurant operations copilot built with Next.js App Router, TypeScript, Tailwind CSS, the OpenAI API, and JSON mock data. Deploy to Vercel. The primary goal for this four-hour hackathon is a working AI restaurant crisis management demo.

Before implementing features, read `docs/PROJECT.md`, `docs/API_CONTRACT.md`, and `docs/PROGRESS.md`. Follow the API contract exactly; coordinate any contract change before either side implements it.

## Ownership and branches

- Developer 1, branch `frontend`: `app/` except `app/api/`, `components/`, `public/`.
- Developer 2, branch `backend`: `app/api/`, `lib/`, `data/`, `types/`.
- Shared: `AGENTS.md`, `docs/`, `README.md`, and project configuration files. Coordinate edits through GitHub before changing shared files. Agree on one owner for dependency and configuration setup before implementation.
- Do not edit the other developer's files without coordination. Do not overwrite or force-push another developer's work.
- Pull the shared documentation into each branch before implementation. Commit small changes and report tasks and blockers in `docs/PROGRESS.md`; integrate shared tracker updates through GitHub.

## Scope

Prioritize working functionality over extra features. No authentication, database, or unnecessary infrastructure. Keep secrets server-side and out of Git. Use the agreed mock restaurant and endpoint contract for integration.

This setup phase authorizes documentation only. Do not implement application code or install dependencies until explicitly instructed.
