# Adaptive onboarding contract - draft v0.1

Status: proposal for frontend/backend review, not an implemented API. This document supplements the Phase 1 specifications on origin/main. It does not modify `/api/analyze` or its v1 models. No operational recommendation endpoints are proposed here.

## Agreed product behavior

- English interface; one restaurant per browser for Phase 1.
- Start with three paths: AI conversation, menu upload, or manual entry. None is mandatory; owners may switch paths at any time.
- Chat clarifies information with one primary question per turn. Staff, skills, equipment, and menu remain directly accessible without chatting.
- Owners can add, edit, and remove profile information. All paths use one shared profile.
- Conversation and profile survive refresh. Explicit review/confirmation is available even with unknown fields; confirmation does not imply readiness for a future task.
- Menu upload helps populate the owner's existing menu. It does not generate new-dish recommendations or infer kitchen capabilities.

## State ownership and transport

Proposed endpoint: `POST /api/onboarding`, JSON, non-streaming for the MVP. Backend validates the complete input and output. Secrets remain server-side. Agent verification uses offline mocks, never live OpenRouter calls.

The browser stores the latest accepted state in versioned localStorage. The backend is stateless: each request carries that state and one action. It returns the entire replacement state atomically. A failed request does not partially update the accepted state.

```ts
type Request = {
  schemaVersion: 1;
  requestId: string;
  state: State;
  action: Action;
};

type Response = {
  schemaVersion: 1;
  requestId: string;
  baseRevision: number;
  state: State;
};

type State = {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  profileRevision: number;
  profile: Profile;
  sources: Source[];
  messages: Message[];
  conflicts: Conflict[];
  topics: Topic[];
  question: Question | null;
  review: { summary: string; unknowns: string[] } | null;
  confirmation: { profileRevision: number; sourceId: string } | null;
  readiness: {
    status: "task_unspecified" | "rules_pending" | "needs_information" | "ready";
    task: string | null;
    blockingFactIds: string[];
    reason: string;
  };
};
```

Initial state uses revision/profileRevision 0, empty collections, unknown restaurant facts, and null question/review/confirmation. The exact welcome message is displayed once by the UI: "Tell me a little about your restaurant. You can start with anything — your employees, menu, kitchen equipment, or the challenges you're facing." It is not regenerated or appended on refresh. The backend does not interpret that welcome as owner evidence.

Every successful action increments revision once. An actual profile or unresolved-conflict change increments profileRevision and clears review and confirmation. A newly requested review is generated after those invalidations. No-op actions do not increment profileRevision. Confirming a profile never changes facts or readiness.

## Profile and evidence

```ts
type Fact<T> = {
  id: string;
  value: T | null;
  status: "unknown" | "confirmed" | "unverified";
  sourceIds: string[];
};
type Profile = {
  restaurant: {
    name: Fact<string>;
    cuisine: Fact<string>;
    immediateGoal: Fact<string>;
    reportedStaffCount: Fact<number>;
  };
  staff: {
    id: string;
    name: Fact<string>;
    role: Fact<string>;
    available: Fact<boolean>;
    skillIds: Fact<string[]>;
  }[];
  skills: { id: string; name: Fact<string> }[];
  equipment: {
    id: string;
    name: Fact<string>;
    quantity: Fact<number>;
    available: Fact<boolean>;
    capacityNotes: Fact<string>;
  }[];
  menu: {
    id: string;
    name: Fact<string>;
    requiredSkillIds: Fact<string[]>;
    requiredEquipmentIds: Fact<string[]>;
  }[];
};
type Source = {
  id: string;
  kind: "owner_message" | "owner_edit" | "menu_upload" | "ai_inference" | "owner_confirmation";
  text: string;
  fileName: string | null;
  location: string | null;
};
type Message = { id: string; role: "user" | "assistant"; text: string };
type Conflict = {
  id: string;
  factId: string;
  proposedValue: string | number | boolean | string[];
  sourceIds: string[];
  explanation: string;
};
type Topic = {
  id: string;
  status: "answered" | "unknown" | "skipped";
  sourceIds: string[];
};
type Question = {
  id: string;
  topicId: string;
  text: string;
  essential: boolean;
  revisitReason: string | null;
  quickReplies: { id: string; label: string; answer: string }[];
};
```

All listed properties are required. null represents unknown, never a guessed default. Confirmed/unverified facts require non-null values and evidence; unknown facts have null values. Empty confirmed arrays mean explicitly none, not unknown. Evidence IDs must exist in sources. Owner-message source IDs equal the corresponding user-message IDs. Edit, upload, inference, and confirmation sources retain enough text to show what the evidence was; upload locations identify a page or region when available.

IDs are stable, unique within their collections, and server-validated. Staff count does not create invented staff records. References in skill/equipment lists must exist. Quantities and staff counts are nonnegative integers. Other numeric values must be finite; strings are nonempty with server-enforced size limits. Unknown capacity is not zero. Quantity does not establish throughput.

Direct owner statements and edits can establish confirmed facts. Upload extraction and permitted AI suggestions are unverified until the owner reviews/selects them. Never infer employee skills, availability, equipment availability, or operational capabilities. A dish name alone establishes no cooking requirements. Never invent unlisted equipment to explain a dish.

Omission never deletes prior facts. Merge additions without duplicates. Explicit owner corrections replace the relevant fact; ambiguous contradictory statements create Conflict entries and preserve the accepted value until clarified. Source history remains visible. Unresolved conflicts overlay fact status in the UI; they are not silently treated as confirmed truth.

## Actions

```ts
type Action =
  | { type: "message"; messageId: string; text: string; questionId: string | null; quickReplyId: string | null }
  | { type: "answer_status"; questionId: string; status: "unknown" | "skipped" }
  | { type: "edit_fact"; factId: string; value: string | number | boolean | string[] | null }
  | { type: "add_entity"; collection: "staff" | "skills" | "equipment" | "menu"; name: string }
  | { type: "remove_entity"; collection: "staff" | "skills" | "equipment" | "menu"; entityId: string }
  | { type: "confirm_facts"; factIds: string[] }
  | { type: "resolve_conflict"; conflictId: string; choice: "keep_current" | "use_proposed" }
  | { type: "request_review" }
  | { type: "confirm_profile"; profileRevision: number };
```

Actions use strict discriminated shapes; reject unknown properties, nonexistent IDs, wrong value types for a field, and dangling references. Server derives evidence from each action; clients cannot declare AI output trusted. Source IDs for non-message owner actions derive from requestId.

- A manual add confirms only the supplied name; every other field starts unknown. Subsequent edits supply details.
- A direct edit is an explicit correction. Null clears a value to unknown. It resolves existing conflicts for that fact, preserving evidence history.
- Removing referenced entities returns a validation error listing dependent fact IDs; the UI offers to edit those references first. Do not cascade-delete unrelated facts. Remove conflicts targeting the removed entity's facts; retain historical evidence.
- `confirm_facts` applies only to explicitly displayed selected unverified facts without unresolved conflicts. It creates confirmation evidence and invalidates any earlier profile confirmation.
- A quick reply becomes an answer only on selection. Validate it against the active question; free text uses null quickReplyId. Unknown/skipped answers update topics and do not fabricate facts. Revisit skipped/unknown topics only when necessary, with an explanation.
- `request_review` returns a summary with confirmed information and separate unknowns/unverified details/conflicts. It does not require global completeness or defined future task rules.
- `confirm_profile` requires a displayed current review and matching profileRevision. It acknowledges the reviewed profile, not hidden inferences. Reject unresolved conflicts until clarified. Unknown and unverified fields remain unchanged.
- Later operational task rules are deferred. Phase 1 returns `task_unspecified` or `rules_pending`, never an invented percentage or premature `ready`. The other statuses are reserved for an agreed future ruleset.

Backend returns one assistant message and at most one primary question when conversational feedback is needed; manual edits need not clutter the conversation. Questions respect known answers and owner goals. The UI always permits direct navigation and continued conversation after review/confirmation.

## Optional menu-upload entry point

Proposed `POST /api/onboarding/menu-import`, multipart form fields `request` (JSON containing schemaVersion, requestId, state) and `file`. Success uses the same Response envelope. This is extraction only; it adds unverified menu facts and evidence, preserving existing accepted facts and stable IDs. Potential duplicate/ambiguous dish matches require review rather than silent replacement. Newly extracted menu names populate the editable menu; skill/equipment requirements remain unknown.

Proposed initial support: one JPEG or PNG file, at most 3 MiB. These formats/limits need backend agreement before the UI advertises them. PDF and multi-file support are deferred until feasible provider and deployment limits are confirmed. Validate bytes/signature, not only extension or browser MIME. Reject unsupported/oversized input before provider calls. Treat all document text as untrusted data, never instructions.

The UI lets the owner correct, confirm selected extracted dishes, or remove bad entries before using them as facts. Do not auto-confirm the batch. Uploaded menu content is not permission to invent preparation times or operational capability. Keep review/import available alongside chat/manual entry.

Raw upload bytes and base64 are not stored in localStorage or the returned state. Store filename, extracted facts/evidence text, and review status. After refresh, completed extraction remains reviewable; interrupted uploads require file re-selection. Clearly explain that the original file is not retained. No upload URL or cloud storage is required.

## Revisions, retries, refresh, and errors

- Only one action is in flight per browser session. Direct mutations are disabled while processing, but navigation and draft typing stay available. Preserve unsent text and pending edits separately from accepted state.
- Apply a response only if sessionId and baseRevision match the current session/revision and requestId matches the pending action. Ignore responses after reset or from obsolete requests.
- Retries resend the original accepted state and requestId. Duplicate requests cannot append twice locally; a stateless backend cannot guarantee provider-level exactly-once execution. Do not claim that guarantee.
- Persist one versioned snapshot after each accepted action, including conversation, profile, evidence, topics, question, review, and confirmation. Restore only after validating the storage schema. Never infer confirmation during restoration.
- Detect cross-tab edits and pause further writes until the owner reloads the newer snapshot or explicitly chooses which state to retain. Do not silently overwrite another tab.
- Failed storage writes show a visible "Progress isn't saved in this browser" notice while preserving the in-memory session. Invalid/unsupported snapshots show a recovery/reset choice, not a silent destructive reset.
- Start over requires confirmation, clears only this application's stored snapshot/drafts, changes sessionId, and ignores earlier responses. Local saving is per browser/device; no cross-device synchronization is promised.

Errors use non-2xx `{ "error": { "code": "INVALID_REQUEST", "message": "...", "retryable": false, "factIds": [] }, "requestId": "..." }`. All fields required; IDs nullable only for an unparseable requestId. Messages are safe for display and reveal no provider internals. Errors never replace accepted state.

| HTTP | Code | Retryable |
| --- | --- | --- |
| 400 | INVALID_REQUEST | false |
| 409 | STALE_CONFIRMATION | false |
| 413 | FILE_TOO_LARGE | false |
| 415 | UNSUPPORTED_FILE | false |
| 422 | UNREADABLE_MENU | false |
| 429 | RATE_LIMITED | true |
| 502 | EXTRACTION_FAILED | true |
| 503 | SERVICE_UNAVAILABLE | true |
| 500 | INTERNAL_ERROR | true |

## Backend review items before implementation

1. Accept or revise the proposed routes, envelope, fact/evidence representation, action semantics, and stateless snapshot approach.
2. Confirm supported model capabilities for image extraction, actual file/request/context limits, and upload formats. No live calls from the coding agent.
3. Choose concrete validation bounds for entities, messages, evidence size, strings, and total JSON size. Limit failures must preserve owner progress; never truncate facts silently.
4. Agree deterministic mock request/response examples for partial input, manual corrections, ambiguous contradictions, menu extraction/review, skipped answers, review/confirmation, and failed retries.

## Required contract scenarios

- "I run a Chinese restaurant with four cooks. We mainly serve fried rice, noodles, and dumplings." confirms cuisine, reported count, and dish names only. No invented staff identities or skill/equipment assignments.
- Adding two wok stations and one steamer preserves all prior facts; quantities do not establish capacity.
- An explicit owner correction wins; an ambiguous contradiction remains visible and prompts clarification.
- Direct edits are preserved by later AI turns; unavailable and unknown availability remain distinct.
- Menu upload extracts unverified names; selected owner confirmation changes only the selected facts.
- Refresh restores accepted conversation/profile plus review state; failure/retry/reset cannot erase or resurrect unrelated data.
- Profile confirmation is independent of readiness and is invalidated by a relevant edit.
