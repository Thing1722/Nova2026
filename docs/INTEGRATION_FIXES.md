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
