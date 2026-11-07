# Adaptive onboarding backend implementation sketch

Status: **backend implementation complete; Node-enabled verification pending**. This document is the frontend integration handoff for the backend boundary.

## Scope

Developer 2 will implement the adaptive onboarding backend only:

- One non-streaming JSON endpoint for a complete accepted onboarding state plus one owner action.
- Server-side OpenRouter extraction behind a reusable client.
- Strict request, provider-output, merged-profile, and response validation.
- Evidence-backed profile merging that preserves accepted facts, records contradictions, and applies explicit owner corrections.
- Exactly one adaptive question with optional quick replies.
- Deterministic offline behavior for skipped/unknown answers and provider outages.
- Mocked tests only. Coding agents never make live OpenRouter requests.

No analysis endpoint changes, frontend changes, database, authentication, menu-file extraction, or later-phase recommendations are included.

## Proposed transport boundary

The implementation should use the state/action envelope already described in `ONBOARDING_CONTRACT_DRAFT.md`, rather than introduce a second profile format.

```ts
type OnboardingRequest = {
  schemaVersion: 1;
  requestId: string;
  state: OnboardingState;
  action: OnboardingAction;
};

type OnboardingResponse = {
  schemaVersion: 1;
  requestId: string;
  baseRevision: number;
  state: OnboardingState;
};
```

For chat, the frontend sends a `message` action. `state` contains the existing partial profile, sources, recent conversation, topics, current question, conflicts, review, confirmation, and readiness. The backend returns the complete replacement state atomically. The frontend applies it only when `requestId`, `sessionId`, and `baseRevision` match its pending request.

The canonical route is `POST /api/onboard`. It supersedes the earlier `/api/onboarding` proposal.

## Frontend integration behavior

The frontend should:

1. Keep unsent input separate from the last accepted state.
2. Send one action at a time with a unique `requestId`.
3. Continue displaying the last accepted state during loading or failure.
4. Replace accepted state only with a matching successful response.
5. Render `state.profile` as the editable profile; never reconstruct facts from assistant prose.
6. Render no more than `state.question`, which is either one question or `null`.
7. Treat quick replies as optional; free text remains available.
8. Send “I don't know” or skip through `answer_status`, not as fabricated fact values.
9. Display `confirmed`, `unverified`, and `unknown` distinctly and show unresolved conflicts.
10. Keep readiness and owner confirmation separate.

The current entry-screen `Draft` in `components/onboarding/welcome.tsx` is not an API object. Frontend integration will need a one-time mapping from explicitly entered name/cuisine/messages into owner actions with stable IDs and evidence; it must not submit the local draft as a profile.

## Backend processing sequence

For a `message` action:

1. Strictly validate the request envelope, current state, IDs, references, sizes, and active-question references.
2. Append the owner message and its owner-message evidence source exactly once.
3. Detect deterministic control input such as skip, unknown, or an explicit correction marker.
4. Ask OpenRouter for a bounded structured extraction containing only facts supported by the latest owner message, correction targets, ambiguity, goal signals, and question candidates.
5. Validate model JSON before it can affect state. Reject invented staff identities, qualifications, availability, equipment, capacity, or dish requirements.
6. Convert accepted extraction into fact updates with stable IDs and evidence.
7. Merge additions without deleting omitted facts. Explicit corrections replace targeted facts; ambiguous contradictions create conflicts and preserve the accepted value.
8. Revalidate the complete merged state.
9. Determine missing details and select exactly one unanswered, goal-relevant question. Include optional quick replies plus free text.
10. Increment revision once. Increment profile revision only for a profile/conflict change, then invalidate stale review and confirmation.
11. Return the complete replacement state.

## OpenRouter boundary and fallback

`lib/ai/openrouter.ts` will read `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` only at runtime on the server. It will never return credentials or raw provider errors, and application code will not log request headers or secrets.

Provider output is untrusted input. The client requests structured JSON where supported, bounds response size, parses JSON, and passes it to onboarding-specific validation before merge.

If configuration, network access, provider output, or provider availability fails, deterministic fallback will:

- preserve and return the owner's message;
- process an unambiguous skip/unknown response;
- preserve the accepted profile without claiming AI extraction occurred;
- ask one deterministic question chosen from already-known missing fields when safe;
- otherwise return a retryable safe error without replacing frontend state.

The fallback will not guess or regex-create staff qualifications, availability, equipment, capacities, or dish requirements.

## Question selection

Question priority is deterministic after extraction:

1. Clarify a conflict affecting the current goal.
2. Clarify the immediate goal when absent.
3. Ask for named staff/roles when headcount is known but identities are needed.
4. Ask for explicit staff skills and availability.
5. Ask for known equipment identities, quantities, availability, and capacity separately.
6. Ask for menu requirements only after dishes exist.
7. Ask lower-priority restaurant details only when useful.

Topics marked answered are not repeated. Unknown/skipped topics are revisited only when they become essential, with `revisitReason` populated.

## Readiness

Operational-analysis readiness rules are deferred. Phase 1 returns `task_unspecified` when the owner's goal is unclear and `rules_pending` when the goal is known. It does not emit `ready`. Review and owner confirmation remain independent of readiness.

## Planned backend files

- `app/api/onboard/route.ts`
- `lib/ai/openrouter.ts`
- `lib/ai/openrouter.test.ts`
- `lib/onboarding/extraction.ts`
- `lib/onboarding/questions.ts`
- `lib/onboarding/state.ts`
- `lib/onboarding/validation.ts`
- focused tests beside the onboarding modules
- additions to `types/api.ts` only to codify the confirmed shared onboarding request/response types

Existing `lib/restaurant-profile.ts` remains the merge/validation foundation. Existing `/api/analyze` types and behavior remain unchanged.

## Offline verification scenarios

- Short Chinese-restaurant description confirms cuisine, reported count, and three dish names only.
- Detailed description adds explicit staff, skills, stations, equipment, and menu requirements without invention.
- “Actually, we have three cooks, not four” replaces reported count and preserves unrelated facts.
- Missing employee skills remain unknown and cause one relevant follow-up.
- Unknown/skipped answers update topic state without question loops.
- OpenRouter unavailable preserves accepted state, does not claim extraction, and uses only safe deterministic fallback.
- Invalid or invented provider facts never enter the profile.
- Response contains exactly one question or `null` and remains frontend-editable.

## Confirmed contract decisions

1. Canonical route: `POST /api/onboard`.
2. The full stateless state/action envelopes are authoritative.
3. Readiness is limited to `task_unspecified` and `rules_pending` in Phase 1.
4. Review and profile confirmation remain independent of readiness.

