import type {
  Fact,
  OnboardingAction,
  OnboardingErrorCode,
  OnboardingRequest,
  OnboardingResponse,
  OnboardingState,
  Profile,
  Source,
} from "../../types/api";
import { createUnknownFact, mergeRestaurantProfile, validateRestaurantProfile } from "../restaurant-profile";
import { applyExtraction, type MessageExtractor } from "./extraction";
import { buildReview, calculateReadiness, isQuestionTopicSatisfied, selectNextQuestion, upsertTopic } from "./questions";
import { validateOnboardingStateShape } from "./validation";

export class OnboardingError extends Error {
  constructor(
    public readonly code: OnboardingErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly factIds: string[] = [],
  ) {
    super(message);
  }
}

export interface OnboardingDependencies {
  extractor: MessageExtractor;
}

export function createInitialOnboardingState(sessionId: string): OnboardingState {
  return {
    schemaVersion: 1,
    sessionId,
    revision: 0,
    profileRevision: 0,
    profile: {
      restaurant: {
        name: createUnknownFact("fact:restaurant:name"),
        cuisine: createUnknownFact("fact:restaurant:cuisine"),
        immediateGoal: createUnknownFact("fact:restaurant:immediateGoal"),
        reportedStaffCount: createUnknownFact("fact:restaurant:reportedStaffCount"),
      },
      staff: [],
      skills: [],
      equipment: [],
      menu: [],
    },
    sources: [],
    messages: [],
    conflicts: [],
    topics: [],
    question: null,
    review: null,
    confirmation: null,
    readiness: {
      status: "task_unspecified",
      task: null,
      blockingFactIds: ["fact:restaurant:immediateGoal"],
      reason: "The owner has not confirmed which operational task they want help with.",
    },
  };
}

export async function processOnboardingRequest(
  request: OnboardingRequest,
  dependencies: OnboardingDependencies,
): Promise<OnboardingResponse> {
  const baseRevision = request.state.revision;
  const state = structuredClone(request.state);
  const beforeProfile = JSON.stringify(state.profile);
  const beforeConflicts = JSON.stringify(state.conflicts);
  let keepCurrentQuestion = false;

  switch (request.action.type) {
    case "message":
      keepCurrentQuestion = await processMessage(state, request.action, request.requestId, dependencies.extractor);
      break;
    case "answer_status":
      processAnswerStatus(state, request.action);
      break;
    case "edit_fact":
      processEditFact(state, request.action.factId, request.action.value, request.requestId);
      break;
    case "add_entity":
      processAddEntity(state, request.action.collection, request.action.name, request.requestId);
      break;
    case "remove_entity":
      processRemoveEntity(state, request.action.collection, request.action.entityId);
      break;
    case "confirm_facts":
      processConfirmFacts(state, request.action.factIds, request.requestId);
      break;
    case "resolve_conflict":
      processResolveConflict(state, request.action.conflictId, request.action.choice, request.requestId);
      break;
    case "request_review":
      state.review = buildReview(state);
      break;
    case "confirm_profile":
      processConfirmProfile(state, request.action.profileRevision, request.requestId);
      break;
  }

  const profileChanged = JSON.stringify(state.profile) !== beforeProfile || JSON.stringify(state.conflicts) !== beforeConflicts;
  if (profileChanged) {
    state.profileRevision += 1;
    state.review = null;
    state.confirmation = null;
  }
  state.readiness = calculateReadiness(state.profile);
  if (!keepCurrentQuestion) state.question = selectNextQuestion(state);
  state.revision += 1;

  const report = validateRestaurantProfile(state.profile, state.sources, state.conflicts);
  const errors = report.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    const clientMutation = request.action.type !== "message";
    throw new OnboardingError(
      clientMutation ? "INVALID_REQUEST" : "INTERNAL_ERROR",
      clientMutation ? errors[0].message : "The updated restaurant profile could not be validated.",
      clientMutation ? 400 : 500,
      !clientMutation,
      [...new Set(errors.flatMap((issue) => (issue.factId ? [issue.factId] : [])))],
    );
  }
  if (!validateOnboardingStateShape(state)) {
    throw new OnboardingError("INTERNAL_ERROR", "The updated onboarding state could not be validated.", 500, true);
  }

  return { schemaVersion: 1, requestId: request.requestId, baseRevision, state };
}

async function processMessage(
  state: OnboardingState,
  action: Extract<OnboardingAction, { type: "message" }>,
  requestId: string,
  extractor: MessageExtractor,
): Promise<boolean> {
  if (state.messages.length > 98 || state.sources.length > 98) {
    throw new OnboardingError("INVALID_REQUEST", "This onboarding session has reached its Phase 1 history limit.", 400);
  }
  if (state.messages.some((message) => message.id === action.messageId) || state.sources.some((source) => source.id === action.messageId)) {
    throw new OnboardingError("INVALID_REQUEST", "messageId has already been used.", 400);
  }
  validateQuestionAnswer(state, action.questionId, action.quickReplyId, action.text);
  const priorQuestion = state.question;
  const ownerSource: Source = {
    id: action.messageId,
    kind: "owner_message",
    text: action.text.trim(),
    fileName: null,
    location: null,
  };
  state.sources.push(ownerSource);
  state.messages.push({ id: action.messageId, role: "user", text: action.text.trim() });

  const answerStatus = detectAnswerStatus(action.text);
  if (answerStatus && priorQuestion && action.questionId === priorQuestion.id) {
    state.topics = upsertTopic(state.topics, priorQuestion.topicId, answerStatus, ownerSource.id);
    state.question = null;
    appendAssistant(state, requestId, "That’s okay. I’ll keep that detail marked as unknown and move on.");
    return false;
  }

  const result = await extractor.extract(state, action.text.trim());
  if (!result.ok) {
    appendAssistant(state, requestId, extractionFailureMessage(result.reason));
    return priorQuestion !== null;
  }

  const inferenceSourceId = `inference:${action.messageId}`;
  if (result.payload.facts.some((fact) => fact.status === "unverified")) {
    state.sources.push({
      id: inferenceSourceId,
      kind: "ai_inference",
      text: `Unverified interpretation of owner message ${action.messageId}.`,
      fileName: null,
      location: null,
    });
  }
  const merged = applyExtraction(
    state,
    result.payload,
    { confirmed: ownerSource.id, inferred: inferenceSourceId },
    action.text,
  );
  state.profile = merged.profile;
  state.conflicts = merged.conflicts;
  if (priorQuestion && action.questionId === priorQuestion.id && isQuestionTopicSatisfied(state.profile, priorQuestion.topicId)) {
    state.topics = upsertTopic(state.topics, priorQuestion.topicId, "answered", ownerSource.id);
  }
  const changed = merged.changedFactIds.length;
  appendAssistant(
    state,
    requestId,
    changed > 0
      ? `I updated ${changed} profile ${changed === 1 ? "detail" : "details"} from what you shared.`
      : "I saved your message. I did not find a new profile detail that I could safely confirm.",
  );
  return false;
}

function processAnswerStatus(
  state: OnboardingState,
  action: Extract<OnboardingAction, { type: "answer_status" }>,
): void {
  if (!state.question || state.question.id !== action.questionId) {
    throw new OnboardingError("INVALID_REQUEST", "The question is no longer active.", 400);
  }
  state.topics = upsertTopic(state.topics, state.question.topicId, action.status);
  state.question = null;
}

function processEditFact(
  state: OnboardingState,
  factId: string,
  value: string | number | boolean | string[] | null,
  requestId: string,
): void {
  const proposed = structuredClone(state.profile);
  const fact = findFact(proposed, factId);
  if (!fact) throw new OnboardingError("INVALID_REQUEST", "The edited fact does not exist.", 400, false, [factId]);
  if (!valueMatchesKind(factKind(proposed, factId), value)) {
    throw new OnboardingError("INVALID_REQUEST", "The edited value has the wrong type for this fact.", 400, false, [factId]);
  }
  const source = ownerActionSource(requestId, `Owner edited fact ${factId}.`);
  state.sources = addSource(state.sources, source);
  fact.value = value;
  fact.status = value === null ? "unknown" : "confirmed";
  fact.sourceIds = [source.id];
  const merged = mergeRestaurantProfile(state.profile, proposed, state.conflicts, { correctionFactIds: [factId] });
  state.profile = merged.profile;
  state.conflicts = merged.conflicts;
}

function processAddEntity(
  state: OnboardingState,
  collection: "staff" | "skills" | "equipment" | "menu",
  name: string,
  requestId: string,
): void {
  const normalized = name.trim();
  if (namedEntities(state.profile, collection).length >= 100) {
    throw new OnboardingError("INVALID_REQUEST", `The ${collection} collection has reached its Phase 1 limit.`, 400);
  }
  if (namedEntities(state.profile, collection).some((entity) => entity.name.value?.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    throw new OnboardingError("INVALID_REQUEST", "An entry with that name already exists.", 400);
  }
  const source = ownerActionSource(requestId, `Owner added ${collection} entry: ${normalized}.`);
  state.sources = addSource(state.sources, source);
  const id = actionEntityId(collection, requestId);
  if (collection === "staff") {
    state.profile.staff.push({
      id,
      name: confirmedFact(`fact:${id}:name`, normalized, source.id),
      role: createUnknownFact(`fact:${id}:role`),
      available: createUnknownFact(`fact:${id}:available`),
      skillIds: createUnknownFact(`fact:${id}:skillIds`),
      assignedStationId: createUnknownFact(`fact:${id}:assignedStationId`),
    });
  } else if (collection === "skills") {
    state.profile.skills.push({ id, name: confirmedFact(`fact:${id}:name`, normalized, source.id) });
  } else if (collection === "equipment") {
    state.profile.equipment.push({
      id,
      name: confirmedFact(`fact:${id}:name`, normalized, source.id),
      quantity: createUnknownFact(`fact:${id}:quantity`),
      available: createUnknownFact(`fact:${id}:available`),
      capacity: createUnknownFact(`fact:${id}:capacity`),
      capacityNotes: createUnknownFact(`fact:${id}:capacityNotes`),
    });
  } else {
    state.profile.menu.push({
      id,
      name: confirmedFact(`fact:${id}:name`, normalized, source.id),
      requiredSkillIds: createUnknownFact(`fact:${id}:requiredSkillIds`),
      requiredEquipmentIds: createUnknownFact(`fact:${id}:requiredEquipmentIds`),
    });
  }
}

function processRemoveEntity(
  state: OnboardingState,
  collection: "staff" | "skills" | "equipment" | "menu",
  entityId: string,
): void {
  const entities = namedEntities(state.profile, collection);
  if (!entities.some((entity) => entity.id === entityId)) {
    throw new OnboardingError("INVALID_REQUEST", "The entry to remove does not exist.", 400);
  }
  const dependentFactIds = findDependentFacts(state.profile, collection, entityId);
  if (dependentFactIds.length > 0) {
    throw new OnboardingError("INVALID_REQUEST", "Remove references to this entry before deleting it.", 400, false, dependentFactIds);
  }
  const removed = entities.find((entity) => entity.id === entityId) as unknown as Record<string, unknown>;
  const removedFactIds = Object.values(removed).filter(isFact).map((fact) => fact.id);
  if (collection === "staff") state.profile.staff = state.profile.staff.filter((entity) => entity.id !== entityId);
  else if (collection === "skills") state.profile.skills = state.profile.skills.filter((entity) => entity.id !== entityId);
  else if (collection === "equipment") state.profile.equipment = state.profile.equipment.filter((entity) => entity.id !== entityId);
  else state.profile.menu = state.profile.menu.filter((entity) => entity.id !== entityId);
  state.conflicts = state.conflicts.filter((conflict) => !removedFactIds.includes(conflict.factId));
}

function processConfirmFacts(state: OnboardingState, factIds: string[], requestId: string): void {
  if (factIds.length === 0) throw new OnboardingError("INVALID_REQUEST", "Select at least one fact to confirm.", 400);
  const source = ownerActionSource(requestId, `Owner confirmed facts: ${factIds.join(", ")}.`, "owner_confirmation");
  for (const factId of factIds) {
    const fact = findFact(state.profile, factId);
    if (!fact || fact.status !== "unverified" || fact.value === null || state.conflicts.some((conflict) => conflict.factId === factId)) {
      throw new OnboardingError("INVALID_REQUEST", "Only displayed unverified facts without conflicts can be confirmed.", 400, false, [factId]);
    }
  }
  state.sources = addSource(state.sources, source);
  for (const factId of factIds) {
    const fact = findFact(state.profile, factId)!;
    fact.status = "confirmed";
    fact.sourceIds = [...new Set([...fact.sourceIds, source.id])];
  }
}

function processResolveConflict(
  state: OnboardingState,
  conflictId: string,
  choice: "keep_current" | "use_proposed",
  requestId: string,
): void {
  const conflict = state.conflicts.find((item) => item.id === conflictId);
  if (!conflict) throw new OnboardingError("INVALID_REQUEST", "The conflict does not exist.", 400);
  if (choice === "use_proposed") processEditFact(state, conflict.factId, conflict.proposedValue, requestId);
  state.conflicts = state.conflicts.filter((item) => item.id !== conflictId);
}

function processConfirmProfile(state: OnboardingState, profileRevision: number, requestId: string): void {
  if (!state.review || profileRevision !== state.profileRevision) {
    throw new OnboardingError("STALE_CONFIRMATION", "The profile changed after this review. Review it again before confirming.", 409);
  }
  if (state.conflicts.length > 0) {
    throw new OnboardingError("INVALID_REQUEST", "Resolve profile conflicts before confirming.", 400, false, state.conflicts.map((item) => item.factId));
  }
  const source = ownerActionSource(requestId, `Owner confirmed profile revision ${profileRevision}.`, "owner_confirmation");
  state.sources = addSource(state.sources, source);
  state.confirmation = { profileRevision, sourceId: source.id };
}

function validateQuestionAnswer(
  state: OnboardingState,
  questionId: string | null,
  quickReplyId: string | null,
  text: string,
): void {
  if (questionId === null) {
    if (quickReplyId !== null) throw new OnboardingError("INVALID_REQUEST", "A quick reply requires an active question.", 400);
    return;
  }
  if (!state.question || state.question.id !== questionId) {
    throw new OnboardingError("INVALID_REQUEST", "The answered question is no longer active.", 400);
  }
  if (quickReplyId !== null) {
    const reply = state.question.quickReplies.find((item) => item.id === quickReplyId);
    if (!reply || reply.answer !== text) throw new OnboardingError("INVALID_REQUEST", "The quick reply does not match the active question.", 400);
  }
}

function detectAnswerStatus(text: string): "unknown" | "skipped" | null {
  const normalized = text.trim().toLocaleLowerCase().replaceAll(/[.!'’]/g, "");
  if (["i dont know", "not sure", "im not sure", "unknown"].includes(normalized)) return "unknown";
  if (["skip", "skip this", "pass"].includes(normalized)) return "skipped";
  return null;
}

function extractionFailureMessage(
  reason: "unconfigured" | "authentication" | "credits" | "routing" | "rate_limited" |
    "timeout" | "unavailable" | "invalid_response" | "invalid_extraction",
): string {
  const categories: Record<typeof reason, string> = {
    unconfigured: "AI extraction is not configured on the server",
    authentication: "the AI provider rejected the server configuration",
    credits: "the AI provider account cannot currently process requests",
    routing: "the configured AI model is temporarily unavailable",
    rate_limited: "AI extraction is temporarily rate limited",
    timeout: "the AI request timed out",
    unavailable: "the AI provider is temporarily unavailable",
    invalid_response: "the AI response could not be safely validated",
    invalid_extraction: "the extracted facts could not be safely validated",
  };
  const category = categories[reason];
  return `I saved your message, but ${category}, so I did not change your restaurant profile. You can retry or edit the profile directly.`;
}

function appendAssistant(state: OnboardingState, requestId: string, text: string): void {
  const id = `assistant:${requestId}`;
  if (!state.messages.some((message) => message.id === id)) state.messages.push({ id, role: "assistant", text });
}

function findFact(profile: Profile, factId: string): Fact<unknown> | null {
  for (const value of Object.values(profile.restaurant)) if (value.id === factId) return value as Fact<unknown>;
  for (const collection of [profile.staff, profile.skills, profile.equipment, profile.menu]) {
    for (const entity of collection) {
      for (const value of Object.values(entity)) if (isFact(value) && value.id === factId) return value;
    }
  }
  return null;
}

function findDependentFacts(profile: Profile, collection: string, entityId: string): string[] {
  const ids: string[] = [];
  if (collection === "skills") {
    for (const member of profile.staff) if (member.skillIds.value?.includes(entityId)) ids.push(member.skillIds.id);
    for (const dish of profile.menu) if (dish.requiredSkillIds.value?.includes(entityId)) ids.push(dish.requiredSkillIds.id);
  }
  if (collection === "equipment") {
    for (const member of profile.staff) if (member.assignedStationId.value === entityId) ids.push(member.assignedStationId.id);
    for (const dish of profile.menu) if (dish.requiredEquipmentIds.value?.includes(entityId)) ids.push(dish.requiredEquipmentIds.id);
  }
  return [...new Set(ids)];
}

function namedEntities(
  profile: Profile,
  collection: "staff" | "skills" | "equipment" | "menu",
): Array<{ id: string; name: Fact<string> }> {
  if (collection === "staff") return profile.staff;
  if (collection === "skills") return profile.skills;
  if (collection === "equipment") return profile.equipment;
  return profile.menu;
}

function factKind(profile: Profile, factId: string): "string" | "number" | "boolean" | "stringArray" | null {
  if ([profile.restaurant.name.id, profile.restaurant.cuisine.id, profile.restaurant.immediateGoal.id].includes(factId)) return "string";
  if (profile.restaurant.reportedStaffCount.id === factId) return "number";
  for (const member of profile.staff) {
    if ([member.name.id, member.role.id, member.assignedStationId.id].includes(factId)) return "string";
    if (member.available.id === factId) return "boolean";
    if (member.skillIds.id === factId) return "stringArray";
  }
  for (const skill of profile.skills) if (skill.name.id === factId) return "string";
  for (const equipment of profile.equipment) {
    if ([equipment.name.id, equipment.capacityNotes.id].includes(factId)) return "string";
    if ([equipment.quantity.id, equipment.capacity.id].includes(factId)) return "number";
    if (equipment.available.id === factId) return "boolean";
  }
  for (const dish of profile.menu) {
    if (dish.name.id === factId) return "string";
    if ([dish.requiredSkillIds.id, dish.requiredEquipmentIds.id].includes(factId)) return "stringArray";
  }
  return null;
}

function valueMatchesKind(kind: ReturnType<typeof factKind>, value: unknown): boolean {
  if (value === null) return true;
  if (kind === "string") return typeof value === "string" && value.trim().length > 0;
  if (kind === "number") return typeof value === "number" && Number.isInteger(value) && value >= 0;
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "stringArray") return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
  return false;
}

function ownerActionSource(
  requestId: string,
  text: string,
  kind: Source["kind"] = "owner_edit",
): Source {
  return { id: `source:${requestId}`, kind, text, fileName: null, location: null };
}

function addSource(sources: Source[], source: Source): Source[] {
  if (sources.some((item) => item.id === source.id)) throw new OnboardingError("INVALID_REQUEST", "requestId has already been used.", 400);
  if (sources.length >= 100) throw new OnboardingError("INVALID_REQUEST", "This onboarding session has reached its Phase 1 evidence limit.", 400);
  return [...sources, source];
}

function actionEntityId(collection: string, requestId: string): string {
  const suffix = requestId.replaceAll(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
  return `${collection}:${suffix}`;
}

function confirmedFact<T>(id: string, value: T, sourceId: string): Fact<T> {
  return { id, value, status: "confirmed", sourceIds: [sourceId] };
}

function isFact(value: unknown): value is Fact<unknown> {
  return Boolean(value && typeof value === "object" && "id" in value && "value" in value && "status" in value && "sourceIds" in value);
}
