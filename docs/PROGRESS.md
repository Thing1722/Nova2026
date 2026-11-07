# Collaboration Tracker

Statuses: **Not Started / In Progress / Completed / Blocked**. Coordinate shared edits through GitHub. Read PROJECT.md and API_CONTRACT.md before implementation.

**Current focus:** Phase 1 — Adaptive Restaurant Onboarding. Later phases await owner clarification. This workflow revision is local on `backend` until committed and integrated.

| Owner | Task | Status |
| --- | --- | --- |
| Shared | Specify adaptive onboarding workflow and defer later phases | Completed |
| Developer 2 | Existing analysis-v1 models and sample JSON fixture | Completed |
| Shared | Agree onboarding contract, evidence, merge, state, and readiness semantics | Not Started |
| Shared | Coordinate Next.js/configuration setup owner | Not Started |
| Developer 1 | Conversation, free text, quick replies, loading/errors | Not Started |
| Developer 1 | Editable profile, evidence labels, summary and confirmation | Not Started |
| Developer 2 | Partial-profile models and incremental extraction/merge validation | Not Started |
| Developer 2 | Adaptive questions and task-specific readiness | Not Started |
| Shared | Integrate and verify onboarding and corrections | Not Started |

## Current blockers and decisions

- Project tooling is not initialized; Node, npm, and tsc were unavailable at the last check. Existing data/models passed offline structural checks, not a compiler check.
- Agree on the onboarding API/state schema and shared configuration owner before implementation.
- Existing analysis models require complete values and must not serve as partial onboarding state. Sample data is a fixture, not owner-confirmed data.
- The current request authorizes workflow/specification changes. Onboarding functionality and later phases are not implemented.
- OpenRouter credentials are application-only. Never request or expose the key or run live OpenRouter calls from Codex.

## Integration checklist

- [ ] Share this revision through GitHub and sync both development branches.
- [ ] Both agents read revised docs and agree on onboarding contract and configuration ownership.
- [ ] Open-ended introduction records only stated facts and preserves them across turns.
- [ ] One adaptive question supports free text, quick replies, unknowns, and skipping.
- [ ] Profile edits persist; duplicates and contradictions are handled explicitly.
- [ ] Evidence status, missing facts, readiness, and owner confirmation remain distinct.
- [ ] Offline scenarios cover partial data, corrections, contradictions, skipped answers, and error recovery.

**Next integration milestone:** Agree on the onboarding contract, then implement a short conversation that extracts the Chinese restaurant example, incorporates equipment and staff skills, supports an owner correction, and presents an accurate confirmation summary. Do not implement later phases until clarified.
