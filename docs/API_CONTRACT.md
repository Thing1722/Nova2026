# Shared API Contract — v1

## Scope after the Phase 1 workflow revision

Phase 1 is now adaptive restaurant onboarding; see `PROJECT.md`. The `/api/analyze` contract below is preserved unchanged for future analysis compatibility. It is not an onboarding endpoint. Later workflow phases will be clarified before implementation.

Onboarding requires partial profiles, unknown values, field-level evidence, contradictions, owner edits, adaptive questions, and explicit confirmation. Those concepts are not represented by this analysis request. Do not submit incomplete profiles here, add extra properties, fabricate required values, or treat unverified inferences as operational facts.

Agree on a separate onboarding contract through GitHub before endpoint implementation. Its route and wire format are pending. It must cover:

- Incremental messages and profile edits, preserving facts and stable entity IDs.
- Confirmed facts, missing/ambiguous details, unverified inferences, evidence, and unresolved conflicts.
- One primary follow-up question, optional quick replies, and unknown/skipped answers.
- Updated editable profile, task-specific readiness, summary, and owner confirmation as separate states.
- Conversation state ownership and safe error/retry behavior without losing collected information.

Existing analysis models and fixtures remain compatible with v1. A future handoff must explicitly map sufficiently confirmed onboarding facts to this request; conversion and task readiness rules remain deferred. No onboarding wire schema is finalized in this revision.

## Transport and rules

`POST /api/analyze` with `Content-Type: application/json`. Successful responses use HTTP 200 and exactly the success structure below. All fields shown are required; no `undefined`, optional fields, or extra properties. Lists may be empty. Property names use camelCase. IDs are unique within each entity list; every referenced ID must exist in the request. Text fields are nonempty strings, counts are nonnegative integers, and numeric values must be finite.

Request `available` represents crisis-time availability. `baselineAvailable` represents availability before the crisis. `serviceMinutes` and `expectedOrders` are positive integers. Every dish requires at least one skill and may require zero or more equipment IDs. Skill identifiers are case-sensitive strings shared between staff and dishes. Each dish is one order for coverage calculations. Equipment availability is unchanged during this MVP scenario.

The backend validates input, validates AI output, and returns JSON matching this contract. The frontend renders this exact structure and must not parse prose as JSON. Coordinate any contract revision through GitHub before implementation.

## Example request

```json
{
  "restaurant": {
    "id": "rest-1",
    "name": "Maple Street Bistro",
    "serviceMinutes": 180,
    "expectedOrders": 60
  },
  "staff": [
    {
      "id": "staff-maya",
      "name": "Maya",
      "role": "Head chef",
      "skills": ["grill", "saute"],
      "baselineAvailable": true,
      "available": false
    },
    {
      "id": "staff-leo",
      "name": "Leo",
      "role": "Line cook",
      "skills": ["saute", "salad"],
      "baselineAvailable": true,
      "available": true
    },
    {
      "id": "staff-nina",
      "name": "Nina",
      "role": "Prep cook",
      "skills": ["salad"],
      "baselineAvailable": true,
      "available": true
    }
  ],
  "equipment": [
    { "id": "eq-grill", "name": "Grill", "available": true },
    { "id": "eq-range", "name": "Range", "available": true },
    { "id": "eq-prep", "name": "Prep station", "available": true }
  ],
  "menu": [
    {
      "id": "dish-steak",
      "name": "Grilled steak",
      "requiredSkills": ["grill"],
      "requiredEquipmentIds": ["eq-grill"]
    },
    {
      "id": "dish-pasta",
      "name": "Mushroom pasta",
      "requiredSkills": ["saute"],
      "requiredEquipmentIds": ["eq-range"]
    },
    {
      "id": "dish-salad",
      "name": "Garden salad",
      "requiredSkills": ["salad"],
      "requiredEquipmentIds": ["eq-prep"]
    }
  ],
  "problemDescription": "Maya called in sick before dinner. We expect 60 orders over three hours. How can we keep service running?"
}
```

## Example success response

```json
{
  "summary": "Pause grilled steak and focus Leo on pasta and Nina on salads while Maya is unavailable.",
  "staffingChanges": [
    {
      "staffId": "staff-leo",
      "recommendedAssignment": "Lead the saute station for mushroom pasta.",
      "reason": "Leo is available and has the required saute skill."
    },
    {
      "staffId": "staff-nina",
      "recommendedAssignment": "Own salad preparation and plating.",
      "reason": "Nina is available and has the required salad skill."
    }
  ],
  "affectedMenuItems": [
    {
      "dishId": "dish-steak",
      "impact": "unavailable",
      "reason": "No available employee has the grill skill."
    },
    {
      "dishId": "dish-pasta",
      "impact": "limited",
      "reason": "Leo is the only available employee with the saute skill."
    }
  ],
  "menuAdjustments": [
    {
      "dishId": "dish-steak",
      "action": "pause",
      "suggestion": "Temporarily remove steak and offer mushroom pasta or garden salad."
    },
    {
      "dishId": "dish-pasta",
      "action": "limit",
      "suggestion": "Pace pasta orders to avoid overloading Leo."
    }
  ],
  "operationalRisks": [
    {
      "severity": "medium",
      "description": "A surge in pasta orders could overload the saute station.",
      "mitigation": "Tell servers to pace pasta orders and suggest salads."
    }
  ],
  "metrics": {
    "calculated": {
      "before": {
        "availableStaffCount": 3,
        "feasibleMenuItemCount": 3,
        "menuCoveragePercent": 100
      },
      "after": {
        "availableStaffCount": 2,
        "feasibleMenuItemCount": 2,
        "menuCoveragePercent": 66.7
      }
    },
    "aiEstimates": {
      "before": { "ordersPerHour": 24, "averageWaitMinutes": 15 },
      "after": { "ordersPerHour": 20, "averageWaitMinutes": 20 },
      "rationale": "Concentrating the remaining staff on two dishes may sustain expected demand of 20 orders per hour, but the lost chef reduces flexibility. These are illustrative estimates, not measured capacity."
    }
  },
  "assumptions": [
    "Listed staff are available for the entire service when marked available.",
    "Ingredients are sufficient for the retained dishes.",
    "Servers can redirect guests from steak to the remaining menu."
  ]
}
```

## Field semantics and metric ownership

- `staffingChanges`: available staff only; assignments must respect listed skills.
- `affectedMenuItems[].impact`: `unavailable` or `limited`. Omit unaffected dishes.
- `menuAdjustments[].action`: `pause`, `limit`, or `keep`. Do not invent dish IDs or silently change dish requirements.
- `operationalRisks[].severity`: `low`, `medium`, or `high`.
- Summary, recommendations, risks, assumptions, and `aiEstimates` are AI-generated. The backend must validate IDs, enums, and feasibility before returning them.
- `metrics.calculated` is computed by backend code, never by the model. `before` uses `baselineAvailable`; `after` uses `available`. A dish is feasible when all required equipment is available and each required skill is held by at least one available employee. Multiple employees may collectively cover skills. This is a coverage check, not a simultaneous capacity model; recommendations do not change skills or availability.
- `availableStaffCount` counts available employees; `feasibleMenuItemCount` counts feasible dishes in the original request menu, including dishes later suggested for pausing. `menuCoveragePercent` is `100 * feasibleMenuItemCount / menu.length`, rounded to one decimal; use 0 for an empty menu.
- `metrics.aiEstimates.before` estimates normal service; `after` estimates crisis service with the recommendations applied. `ordersPerHour` and `averageWaitMinutes` are nonnegative numbers rounded to one decimal. Always label them **AI estimates** in the UI; `rationale` explains their basis. They are not calculated metrics or guaranteed outcomes.

## Errors

Return non-2xx JSON with exactly this shape; do not return a partial success object. The frontend checks HTTP status before rendering recommendations.

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Every requiredEquipmentId must reference an equipment entry."
  }
}
```

Codes: HTTP 400 `INVALID_REQUEST`; HTTP 502 `ANALYSIS_FAILED` for provider failure or invalid model output; HTTP 500 `INTERNAL_ERROR` for other failures. Messages must be safe for display and must not expose secrets or provider internals.
