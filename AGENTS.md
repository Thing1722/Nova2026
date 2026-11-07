# ShiftChef AI — Shared Agent Instructions

ShiftChef AI is a restaurant operations copilot built with Next.js App Router, TypeScript, Tailwind CSS, and server-side AI through OpenRouter. Deploy to Vercel. The immediate goal is Phase 1: adaptive restaurant onboarding. Later crisis management and recommendation workflows will be clarified by the owner in future phases.

Before implementing features, read `docs/PROJECT.md`, `docs/API_CONTRACT.md`, and `docs/PROGRESS.md`. Follow the API contract exactly; coordinate any contract change before either side implements it.

## Ownership and branches

- Developer 1, branch `frontend`: `app/` except `app/api/`, `components/`, `public/`.
- Developer 2, branch `backend`: `app/api/`, `lib/`, `data/`, `types/`.
- Shared: `AGENTS.md`, `docs/`, `README.md`, and project configuration files. Coordinate edits through GitHub before changing shared files. Agree on one owner for dependency and configuration setup before implementation.
- Do not edit the other developer's files without coordination. Do not overwrite or force-push another developer's work.
- Pull the shared documentation into each branch before implementation. Commit small changes and report tasks and blockers in `docs/PROGRESS.md`; integrate shared tracker updates through GitHub.

## Scope

Prioritize working functionality over extra features. No authentication, database, or unnecessary infrastructure. Keep secrets server-side and out of Git. Sample data is a development fixture, not a substitute for onboarding the owner’s actual restaurant.

For Phase 1 follow `docs/PROJECT.md`: open-ended input, incremental extraction, one adaptive question at a time, an editable live profile, and explicit confirmation. Preserve prior facts and distinguish confirmed facts, unknowns, and unverified inferences. Never invent skills, availability, or operational capabilities.

The existing `/api/analyze` contract remains unchanged as a future analysis reference. It cannot represent incomplete onboarding state. Agree on a separate onboarding contract through GitHub before building that endpoint. Preserve existing models and fixtures until any replacement is coordinated.

This workflow revision authorizes specification updates, not onboarding implementation. Do not install dependencies, modify frontend-owned files, or implement later phases as part of this revision.

## NOVA security rules

The OpenRouter key may power only restaurant application functionality, never Codex or another coding agent. Never request, display, log, hardcode, or commit the secret. Do not run live OpenRouter requests from Codex. Use offline fixtures or mocks for agent-run verification.
