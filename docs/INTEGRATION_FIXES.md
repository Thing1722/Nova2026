# Frontend/backend integration fixes

## Onboarding validator type narrowing

Found after pulling backend commit `d9d67a9` into `frontend`.

`npm run typecheck` reported two TS2345 errors at the final `uniqueIds` checks in `lib/onboarding/validation.ts`: the messages and topics properties still had type `unknown`, but `uniqueIds` requires an array.

The runtime validators `isMessages` and `isTopics` already checked array contents. However, their return annotations were plain `boolean`, unlike neighboring typed guards. TypeScript therefore could not carry that validation forward into the duplicate-ID checks. Runtime tests passing did not establish that the project compiled; the backend environment had not been able to run TypeScript.

Fix: import the existing `OnboardingMessage` and `OnboardingTopic` interfaces and annotate those functions as `value is OnboardingMessage[]` and `value is OnboardingTopic[]`. The runtime checks, wire contract, ID rules, and payload semantics are unchanged. No casts were added to bypass validation.

Added `lib/onboarding/validation.test.ts` to check valid arrays, duplicate IDs, and malformed message/topic collections.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, including the `/api/onboard` route.
- Backend offline suite: 21 tests passed, including two new validation tests.
- Frontend offline suite: 8 tests passed.

Backend tests were compiled into the ignored `.next/offline-tests` directory using the installed TypeScript compiler with CommonJS output, strict checking, and Node types, then run with `node --test`. Frontend tests ran with `node --experimental-strip-types --test components/onboarding/onboard-transport.test.mjs`. Node emits a non-failing module-type detection warning for the latter; project-wide module settings were left unchanged.

No live OpenRouter requests were made and no credentials were read or displayed. This verifies compilation and offline behavior, not a completed browser/real-provider integration test.

The owner explicitly authorized this narrow backend-file fix and Markdown explanation. The frontend integration, tests, and fix are being shared together through `frontend` and merged into `main` at the owner's request.

## Reported live AI fallback

The owner reports the reply "AI extraction is temporarily unavailable" in localhost. The page and `/api/onboard` are reachable, and the configured environment variable names are present. No credential value was displayed.

This reply comes from `processMessage` in `lib/onboarding/state.ts` when the extractor returns any failure. It does not distinguish missing configuration, provider access/rate limits, timeout/network errors, invalid provider JSON, or rejected extracted facts. Thus the reply alone cannot establish the root cause. A successful HTTP 200 can contain this fallback and does not prove that extraction succeeded.

Backend follow-up: expose a safe, bounded failure category for troubleshooting without logging credentials, owner content, or raw provider responses. Verify the model/provider's structured-output support and runtime configuration. Live OpenRouter diagnosis has not been performed by the coding agent, per AGENTS.md; an owner-run application request is needed to reproduce the provider-side outcome.

Backend follow-up implemented: fallback assistant text now distinguishes missing runtime configuration, rate limiting, provider unavailability, and invalid/rejected structured output. The state/action envelope is unchanged, profile facts are still left untouched on failure, and no credential or raw provider detail is exposed. Live provider diagnosis still requires an owner-run application request.

### Two owner-authorized live diagnostic requests

The owner subsequently authorized exactly two live requests, overriding the normal no-live-call rule for this diagnostic only. Both used `openai/gpt-6-luna` and a synthetic restaurant description; no credentials or raw provider output were displayed.

1. Original application payload (`json_schema`, strict schema, `provider.require_parameters: true`): HTTP 404, no matching endpoints. The client classified this as `unavailable`.
2. Same model with `response_format: { type: "json_object" }` and without the provider parameter filter: HTTP 200. The extraction parser then rejected the returned content as `invalid_extraction`.

Conclusion: the model is reachable under the relaxed configuration, but the application's strict-output routing combination is rejected. Relaxing routing/output settings alone does not fix onboarding because the extraction result still fails application validation. These two requests do not isolate which routing parameter causes the 404 or which extracted field failed validation; no third request was made. Do not weaken evidence/capability validation to accept arbitrary model output.

Next backend step: support a verified structured-output configuration for Luna, or design a validated JSON fallback with a more explicit prompt. Add offline tests for routing rejection and successful HTTP responses containing invalid extraction. Further live verification requires renewed owner authorization.

### Backend compatibility fix

At the owner's request, updated `lib/ai/openrouter.ts` and `lib/onboarding/extraction.ts`:

- `openai/gpt-6-luna` and `~openai/gpt-luna-latest` now use JSON-object mode without `provider.require_parameters`. Other models keep the strict JSON-schema routing. This avoids knowingly repeating Luna's observed incompatible strict request on every turn.
- The system message now includes the actual schema in both modes and explicitly requests a conforming data object. Previously the extraction prompt said "Return only the JSON schema"; in JSON-object mode no schema was supplied, so the model had neither the complete output specification nor an unambiguous instruction to return extracted data.
- Added exact field guidance and an example with owner evidence. The existing extraction parser still rejects wrong envelopes, unsupported claims, fabricated skills, and missing evidence; JSON mode does not bypass validation.
- Increased the output limit from 2,000 to 4,000 tokens and reject provider responses marked truncated, even if their content parses as JSON.
- No automatic retries were introduced. One application extraction still makes at most one provider request.

Offline tests cover Luna routing/prompt configuration, mocked client-to-extractor success, rejection of schema objects and invented qualifications, truncated output, and safe routing/rate-limit failures. The backend suite now has 26 passing tests. No further live requests were made; this fix is offline-verified, and a fresh owner-run localhost message is still needed to confirm live output quality.

### Additional authorized request: Luna Pro configuration mismatch

After the owner reported continued failures, they authorized one additional live diagnostic request. It returned HTTP 404 with "No endpoints found that can handle the requested parameters." The active environment model was now `openai/gpt-6-luna-pro`, whereas the compatibility branch matched only `openai/gpt-6-luna` and the latest-family alias. Thus Luna Pro still received the strict-schema configuration. Added the Pro model ID to the JSON-mode branch and its focused routing test. The model setting and key were not modified. No second request was made under this authorization; live success for Pro remains unverified.

The owner subsequently restarted the local development server and confirmed that AI now works. The owner requested merging the fix without running further tests; none were run during that merge.
