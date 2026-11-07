# Collaboration Tracker

Statuses: **Not Started / In Progress / Completed / Blocked**. Coordinate shared edits through GitHub. Read PROJECT.md and API_CONTRACT.md before implementation.

**Current focus:** Phase 1 — Adaptive Restaurant Onboarding. The shared onboarding contract is finalized at `POST /api/onboard`; later operational-analysis phases and readiness rules await owner clarification.

| Owner | Task | Status |
| --- | --- | --- |
| Shared | Specify adaptive onboarding workflow and defer later phases | Completed |
| Developer 2 | Existing analysis-v1 models and sample JSON fixture | Completed |
| Shared | Agree onboarding contract, evidence, merge, state, and readiness semantics | Completed |
| Shared | Integrate Developer 1’s Next.js/configuration setup from frontend | Completed |
| Developer 1 | Conversation, free text, quick replies, loading/errors | Not Started |
| Developer 1 | Editable profile, evidence labels, summary and confirmation | Not Started |
| Developer 2 | Partial-profile models and incremental extraction/merge validation | Completed |
| Developer 2 | `POST /api/onboard`, OpenRouter boundary, and offline fallback | Completed |
| Developer 2 | Adaptive questions and conservative Phase 1 readiness | Completed |
| Shared | Integrate and verify onboarding and corrections | Not Started |

## Current blockers and decisions

- Developer 1’s Next.js/TypeScript/Tailwind setup and initial onboarding entry page are integrated. Node, npm, and tsc remain unavailable in the backend coding environment, so TypeScript, test, lint, and build commands still require verification in an environment with Node installed.
- The canonical onboarding route is `POST /api/onboard` with the full stateless state/action envelope in `types/api.ts`.
- Existing analysis models require complete values and must not serve as partial onboarding state. Sample data is a fixture, not owner-confirmed data.
- Phase 1 readiness intentionally returns only `task_unspecified` or `rules_pending`; it never reports `ready` before task-specific rules are agreed.
- Blank OpenRouter environment templates are prepared; model choice is pending. Later timing evidence, three baseline comparison interfaces, and new-dish requirements are preserved in PROJECT.md and need future contract clarification.
- OpenRouter credentials are application-only. Never request or expose the key or run live OpenRouter calls from Codex.

## Integration checklist

- [x] Share the finalized contract through GitHub for both development branches.
- [x] Agree on the onboarding contract and configuration ownership.
- [x] Backend open-ended extraction records only supported facts and preserves them across turns.
- [x] Backend returns one adaptive question and supports free text, quick replies, unknowns, and skipping.
- [x] Backend profile edits, duplicate checks, corrections, and contradictions are explicit.
- [x] Evidence status, missing facts, readiness, and owner confirmation remain distinct.
- [x] Offline test scenarios cover partial data, corrections, contradictions, skipped answers, provider failure, review, and confirmation.
- [ ] Run TypeScript, tests, lint, and production build in a Node-enabled environment.
- [ ] Integrate frontend state/actions with `POST /api/onboard` and verify end to end.

**Next integration milestone:** Sync the frontend to the finalized state/action types, run the offline suite in a Node-enabled environment, and verify the Chinese restaurant example, equipment/staff additions, owner correction, skipped question, review, and confirmation end to end. Do not implement later phases until clarified.
