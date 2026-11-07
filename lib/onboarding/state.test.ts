import assert from "node:assert/strict";
import test from "node:test";

import type { OnboardingRequest, OnboardingState } from "../../types/api";
import type { ExtractionPayload, ExtractionResult, MessageExtractor } from "./extraction";
import { createInitialOnboardingState, processOnboardingRequest } from "./state";

test("short description extracts only supported cuisine, headcount, and dishes", async () => {
  const text = "I run a Chinese restaurant with four cooks. We mainly serve fried rice, noodles, and dumplings.";
  const extractor = queuedExtractor({
    facts: [
      fact("restaurant", null, "cuisine", "Chinese", "Chinese restaurant"),
      fact("restaurant", null, "reportedStaffCount", 4, "four cooks"),
      fact("menu", "fried rice", "name", "fried rice", "fried rice"),
      fact("menu", "noodles", "name", "noodles", "noodles"),
      fact("menu", "dumplings", "name", "dumplings", "dumplings"),
    ],
  });

  const response = await send(createInitialOnboardingState("session-short"), text, extractor);

  assert.equal(response.profile.restaurant.cuisine.value, "Chinese");
  assert.equal(response.profile.restaurant.reportedStaffCount.value, 4);
  assert.equal(response.profile.staff.length, 0);
  assert.deepEqual(response.profile.menu.map((dish) => dish.name.value), ["fried rice", "noodles", "dumplings"]);
  assert.ok(response.profile.menu.every((dish) => dish.requiredSkillIds.value === null && dish.requiredEquipmentIds.value === null));
  assert.equal(response.question?.topicId, "restaurant-goal");
  assert.equal(response.readiness.status, "task_unspecified");
});

test("detailed description records explicit staff, skills, equipment, menu requirements, and goal", async () => {
  const text = "Maya grills burgers on the grill station. Maya is available. The grill station handles four dishes. I need staffing help. Burgers require grilling and the grill station.";
  const extractor = queuedExtractor({
    facts: [
      fact("restaurant", null, "immediateGoal", "staffing help", "staffing help"),
      fact("staff", "Maya", "name", "Maya", "Maya"),
      fact("staff", "Maya", "skillNames", ["grills"], "Maya grills"),
      fact("staff", "Maya", "available", true, "Maya is available"),
      fact("staff", "Maya", "assignedStationName", "grill station", "grill station"),
      fact("equipment", "grill station", "name", "grill station", "grill station"),
      fact("equipment", "grill station", "capacity", 4, "handles four dishes"),
      fact("menu", "Burgers", "name", "Burgers", "Burgers"),
      fact("menu", "Burgers", "requiredSkillNames", ["grilling"], "require grilling"),
      fact("menu", "Burgers", "requiredEquipmentNames", ["grill station"], "grill station"),
    ],
  });

  const response = await send(createInitialOnboardingState("session-detailed"), text, extractor);

  assert.equal(response.profile.staff.length, 1);
  assert.equal(response.profile.staff[0].available.value, true);
  assert.ok(response.profile.staff[0].skillIds.value?.length);
  assert.equal(response.profile.equipment[0].capacity.value, 4);
  assert.equal(response.profile.menu[0].requiredEquipmentIds.value?.[0], response.profile.equipment[0].id);
  assert.equal(response.readiness.status, "rules_pending");
  assert.equal(response.readiness.task, "staffing help");
});

test("explicit correction replaces reported count and preserves existing menu", async () => {
  const initialText = "We are a cafe with four cooks and serve soup.";
  const first = await send(createInitialOnboardingState("session-correction"), initialText, queuedExtractor({
    facts: [
      fact("restaurant", null, "cuisine", "cafe", "cafe"),
      fact("restaurant", null, "reportedStaffCount", 4, "four cooks"),
      fact("menu", "soup", "name", "soup", "soup"),
    ],
  }));
  const correctionText = "Actually, we have three cooks, not four.";
  const corrected = await send(first, correctionText, queuedExtractor({
    facts: [fact("restaurant", null, "reportedStaffCount", 3, "three cooks", true)],
  }), "message-correction");

  assert.equal(corrected.profile.restaurant.reportedStaffCount.value, 3);
  assert.equal(corrected.profile.menu[0].name.value, "soup");
  assert.equal(corrected.conflicts.length, 0);
});

test("missing employee skills produce exactly one adaptive question", async () => {
  const text = "Maya is our cook and I want staffing help.";
  const response = await send(createInitialOnboardingState("session-skills"), text, queuedExtractor({
    facts: [
      fact("restaurant", null, "immediateGoal", "staffing help", "staffing help"),
      fact("staff", "Maya", "name", "Maya", "Maya"),
    ],
  }));

  assert.equal(response.profile.staff[0].skillIds.status, "unknown");
  assert.equal(response.question?.topicId, "staff-skills");
  assert.equal(Array.isArray(response.question?.quickReplies), true);
});

test("skipped questions are recorded and not immediately repeated", async () => {
  const state = createInitialOnboardingState("session-skip");
  state.question = {
    id: "question:1:restaurant-goal",
    topicId: "restaurant-goal",
    text: "What is your goal?",
    essential: false,
    revisitReason: null,
    quickReplies: [],
  };
  const request: OnboardingRequest = {
    schemaVersion: 1,
    requestId: "request-skip",
    state,
    action: { type: "answer_status", questionId: state.question.id, status: "skipped" },
  };

  const response = await processOnboardingRequest(request, { extractor: queuedExtractor({ facts: [] }) });

  assert.equal(response.state.topics.find((topic) => topic.id === "restaurant-goal")?.status, "skipped");
  assert.notEqual(response.state.question?.topicId, "restaurant-goal");
});

test("OpenRouter unavailable preserves profile and clearly reports no extraction", async () => {
  const state = createInitialOnboardingState("session-unavailable");
  const before = structuredClone(state.profile);
  const response = await send(state, "We are an Italian restaurant.", unavailableExtractor());

  assert.deepEqual(response.profile, before);
  assert.match(response.messages.at(-1)?.text ?? "", /did not change your restaurant profile/i);
  assert.equal(response.question?.topicId, "restaurant-goal");
});

test("review and confirmation remain independent from conservative readiness", async () => {
  const state = createInitialOnboardingState("session-review");
  state.profile.restaurant.immediateGoal = {
    ...state.profile.restaurant.immediateGoal,
    value: "staffing help",
    status: "confirmed",
    sourceIds: ["source-goal"],
  };
  state.sources.push({ id: "source-goal", kind: "owner_edit", text: "Goal: staffing help", fileName: null, location: null });
  const reviewResponse = await processOnboardingRequest({
    schemaVersion: 1,
    requestId: "request-review",
    state,
    action: { type: "request_review" },
  }, { extractor: queuedExtractor({ facts: [] }) });
  const confirmed = await processOnboardingRequest({
    schemaVersion: 1,
    requestId: "request-confirm",
    state: reviewResponse.state,
    action: { type: "confirm_profile", profileRevision: reviewResponse.state.profileRevision },
  }, { extractor: queuedExtractor({ facts: [] }) });

  assert.ok(confirmed.state.confirmation);
  assert.equal(confirmed.state.readiness.status, "rules_pending");
});

async function send(
  state: OnboardingState,
  text: string,
  extractor: MessageExtractor,
  messageId = `message-${state.revision + 1}`,
): Promise<OnboardingState> {
  const response = await processOnboardingRequest({
    schemaVersion: 1,
    requestId: `request-${messageId}`,
    state,
    action: { type: "message", messageId, text, questionId: null, quickReplyId: null },
  }, { extractor });
  return response.state;
}

function queuedExtractor(payload: ExtractionPayload): MessageExtractor {
  return { async extract(): Promise<ExtractionResult> { return { ok: true, payload }; } };
}

function unavailableExtractor(): MessageExtractor {
  return { async extract(): Promise<ExtractionResult> { return { ok: false, reason: "unavailable" }; } };
}

function fact(
  subject: "restaurant" | "staff" | "skill" | "equipment" | "menu",
  entityName: string | null,
  field: "name" | "cuisine" | "immediateGoal" | "reportedStaffCount" | "role" | "available" | "skillNames" |
    "assignedStationName" | "quantity" | "capacity" | "capacityNotes" | "requiredSkillNames" | "requiredEquipmentNames",
  value: string | number | boolean | string[],
  evidenceQuote: string,
  correction = false,
) {
  return { subject, entityName, field, value, status: "confirmed" as const, correction, evidenceQuote };
}
