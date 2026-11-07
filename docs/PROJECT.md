# ShiftChef AI — Product Specification

**Target user:** A small restaurant owner who needs operational help without lengthy forms.

**Immediate scope:** Phase 1 — Adaptive Restaurant Onboarding. Build an accurate, structured restaurant profile while minimizing owner effort. Later crisis analysis, recommendations, metrics, and other workflow phases will be clarified in future; their end-to-end flow is not finalized here.

**Stack:** Next.js App Router, TypeScript, Tailwind CSS, server-side AI through OpenRouter; Vercel deployment target. No authentication, database, or unnecessary infrastructure.

## Phase 1 workflow

### 1. Open-ended introduction

Welcome the owner and ask:

> Tell me a little about your restaurant. You can start with anything — your employees, menu, kitchen equipment, or the challenges you're facing.

Accept natural language without prerequisite forms. Example: “I run a Chinese restaurant with four cooks. We mainly serve fried rice, noodles, and dumplings.” Record cuisine, reported employee count, and dish names; do not invent individual identities, skills, equipment, or preparation requirements.

### 2. Incremental extraction

After every owner message, extract relevant information, merge it into the existing profile, identify missing, ambiguous, or contradictory details, and choose the most useful follow-up for the owner's immediate goal.

| Area | Information collected when available |
| --- | --- |
| Restaurant | Name, cuisine, owner's immediate goal |
| Employees | Reported count, names or identifiers, roles, availability |
| Skills | Cooking tasks explicitly associated with each employee |
| Equipment | Equipment/station identities, quantities, availability, capacity |
| Menu | Existing dishes and their skill/equipment requirements |

Use stable internal entity IDs. A reported employee count does not establish individual identities. Equipment quantity and capacity are distinct: two woks do not establish orders per hour or simultaneous dish capacity.

Preserve previous facts unless the owner explicitly corrects them. Omitted fields are not deletions. Merge additions without duplicate entities; clarify ambiguous identities. Explicit corrections replace relevant facts; unresolved contradictions stay visible and must not silently overwrite confirmed facts.

Track evidence per fact, including the owner message or edit supplying it. Distinguish:

- **Confirmed facts:** Explicit owner statements, edits, or explicit confirmation of clearly presented facts.
- **Missing information:** Unknown or ambiguous values, including details the owner cannot supply yet.
- **Unverified AI inferences:** Clearly labeled suggestions separate from confirmed facts; excluded from operational decisions until confirmed. Never infer employee skills, equipment availability, or operational capabilities.

Unknown availability is not `true`; unknown capacity is not zero. Empty skill or requirement lists must not imply the owner confirmed that no skills or equipment are needed.

### 3. Intelligent follow-up questions

Ask one primary question at a time, prioritizing information needed for the owner's selected task. Avoid repeating answered questions. Name and cuisine may remain unknown when they do not block the task.

Example: after “We have two wok stations and one steamer,” ask “Do all four cooks know how to use both the wok and steamer, or do they specialize in different stations?”

Offer optional quick replies alongside free text. Include “I'm not sure” and allow skipping nonessential questions. Suggestions become facts only when selected. Track answered, unknown, and skipped topics; revisit a skipped topic only when necessary for the current task, explaining why. Adapt to earlier responses and changes in the owner's goal.

### 4. Editable live restaurant profile

After each message, update the visible profile with employees, skills, equipment, and menu. Clearly show evidence status, unknowns, and unresolved conflicts. Allow individual edits without restarting. Owner corrections are authoritative: preserve unrelated information and use corrections in future turns. A relevant correction invalidates earlier profile confirmation.

### 5. Confirmation and task-specific readiness

Once sufficient information exists for the selected task, summarize the operational setup and ask the owner to confirm accuracy. Keep missing information and unverified inferences visibly separate from confirmed facts. The owner may confirm, edit individual details, or continue chatting.

Track readiness separately from owner confirmation. Readiness requires enough confirmed facts for the selected task and no unresolved contradiction affecting that task, not a globally complete profile. If the task is unclear, clarify it rather than inventing a completeness threshold. General confirmation must not promote hidden inferences or fill unknown values. Request additional facts later when needed.

Exact readiness rules and handoff requirements for future operational tasks will be specified with those phases. Do not force an incomplete profile into the existing analysis request or fabricate required service metrics.

## Phase 1 acceptance criteria

- The exact welcome question accepts free text without mandatory forms.
- The Chinese restaurant example records four cooks and three dishes without inventing capabilities or requirements.
- Successive messages preserve prior facts, avoid duplicates, and incorporate corrections. Contradictions trigger clarification.
- Each turn asks one relevant primary question with optional quick replies and free text. Unknown or skipped nonessential answers do not cause a question loop.
- An editable live profile updates after messages and preserves owner corrections on subsequent turns.
- Confirmed facts, missing values, unverified inferences, and conflicts remain distinguishable; capabilities are never invented.
- A summary supports confirmation, edits, and continued conversation. Task readiness and owner confirmation are separate.
- Errors preserve collected information and allow retry. Credentials remain server-side; agent verification uses offline fixtures or mocks.

## Deferred decisions and scope limits

Before implementation, coordinate onboarding request/response schemas, evidence and merge representation, conversation state handling, and task readiness rules through GitHub. The existing analysis contract and sample dataset are retained references for later crisis analysis, not the onboarding schema.

Chef absence remains a possible future demo scenario. Its full workflow, recommendations, before/after metrics, and new-dish suggestions await further clarification. Do not implement these phases based on assumptions.

Out of scope: authentication, databases, persistent storage infrastructure, POS integrations, payments, live staffing feeds, and production optimization guarantees. Keep implementation small enough for the hackathon.

## Preserved notes for future phases

These owner clarifications from main remain recorded for later specification. They do not expand the current Phase 1 implementation scope; later workflow details and contracts still require clarification.

- Model access uses OpenRouter. `.env.example` contains the shared template; runtime configuration uses server-side `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`. The model choice remains pending. Never request, expose, or use the secret from a coding agent.
- Future chef-specific preparation-time estimates should combine owner-entered data, typical dish-duration research, and expected order volume. Track origins, cite retrieved evidence, and distinguish measured times from estimates.
- Staffing risks, staffing recommendations, and new-dish recommendations were requested as three separate interfaces compared against a common normal-operations baseline with all staff available.
- New-dish recommendations are a requested future capability, not discarded as out of scope; detailed behavior will be clarified later.
- Analysis contract v1 needs a coordinated revision before those features: chef-specific timing, order mix, evidence, new dishes, and separate scenario comparisons. Timing units, order distribution, and research provider remain undecided. Skill coverage alone does not measure service capacity.
