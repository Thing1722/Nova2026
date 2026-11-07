import type {
  Conflict,
  Fact,
  OnboardingAction,
  OnboardingQuestion,
  OnboardingRequest,
  OnboardingState,
  Profile,
  Source,
} from "../../types/api";
import { validateRestaurantProfile } from "../restaurant-profile";

const MAX_REQUEST_CHARS = 256_000;
const MAX_TEXT_CHARS = 5_000;
const MAX_ENTITIES = 100;
const MAX_MESSAGES = 100;

export type RequestValidationResult =
  | { ok: true; value: OnboardingRequest }
  | { ok: false; message: string; factIds: string[] };

export function parseOnboardingRequest(input: unknown): RequestValidationResult {
  if (!isRecord(input) || !hasKeys(input, ["schemaVersion", "requestId", "state", "action"])) {
    return invalid("Request must contain exactly schemaVersion, requestId, state, and action.");
  }
  if (input.schemaVersion !== 1 || !isBoundedString(input.requestId, 1, 120)) {
    return invalid("schemaVersion must be 1 and requestId must be a nonempty string.");
  }
  if (!isState(input.state)) return invalid("Onboarding state is malformed.");
  if (!isAction(input.action)) return invalid("Onboarding action is malformed.");

  const request = input as unknown as OnboardingRequest;
  const report = validateRestaurantProfile(request.state.profile, request.state.sources, request.state.conflicts);
  const errors = report.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      message: errors[0].message,
      factIds: [...new Set(errors.flatMap((issue) => (issue.factId ? [issue.factId] : [])))],
    };
  }
  return { ok: true, value: request };
}

export function requestBodyWithinLimit(text: string): boolean {
  return new TextEncoder().encode(text).byteLength <= MAX_REQUEST_CHARS;
}

export function validateOnboardingStateShape(value: unknown): value is OnboardingState {
  return isState(value);
}

function isState(value: unknown): value is OnboardingState {
  if (!isRecord(value) || !hasKeys(value, [
    "schemaVersion", "sessionId", "revision", "profileRevision", "profile", "sources", "messages",
    "conflicts", "topics", "question", "review", "confirmation", "readiness",
  ])) return false;
  if (
    value.schemaVersion !== 1 ||
    !isBoundedString(value.sessionId, 1, 120) ||
    !isNonnegativeInteger(value.revision) ||
    !isNonnegativeInteger(value.profileRevision) ||
    value.profileRevision > value.revision ||
    !isProfile(value.profile) ||
    !isSources(value.sources) ||
    !isMessages(value.messages) ||
    !isConflicts(value.conflicts) ||
    !isTopics(value.topics) ||
    !(value.question === null || isQuestion(value.question)) ||
    !(value.review === null || isReview(value.review)) ||
    !(value.confirmation === null || isConfirmation(value.confirmation)) ||
    !isReadiness(value.readiness)
  ) return false;
  return uniqueIds(value.sources) && uniqueIds(value.messages) && uniqueIds(value.conflicts) && uniqueIds(value.topics);
}

function isProfile(value: unknown): value is Profile {
  if (!isRecord(value) || !hasKeys(value, ["restaurant", "staff", "skills", "equipment", "menu"])) return false;
  if (!isRecord(value.restaurant) || !hasKeys(value.restaurant, ["name", "cuisine", "immediateGoal", "reportedStaffCount"])) return false;
  if (
    !isFact(value.restaurant.name, "string") ||
    !isFact(value.restaurant.cuisine, "string") ||
    !isFact(value.restaurant.immediateGoal, "string") ||
    !isFact(value.restaurant.reportedStaffCount, "number") ||
    !isBoundedArray(value.staff) || !isBoundedArray(value.skills) ||
    !isBoundedArray(value.equipment) || !isBoundedArray(value.menu)
  ) return false;

  const staffValid = value.staff.every((member) => isRecord(member) && hasKeys(member, [
    "id", "name", "role", "available", "skillIds", "assignedStationId",
  ]) && isEntityId(member.id) && isFact(member.name, "string") && isFact(member.role, "string") &&
    isFact(member.available, "boolean") && isFact(member.skillIds, "stringArray") &&
    isFact(member.assignedStationId, "string"));
  const skillsValid = value.skills.every((skill) => isRecord(skill) && hasKeys(skill, ["id", "name"]) &&
    isEntityId(skill.id) && isFact(skill.name, "string"));
  const equipmentValid = value.equipment.every((equipment) => isRecord(equipment) && hasKeys(equipment, [
    "id", "name", "quantity", "available", "capacity", "capacityNotes",
  ]) && isEntityId(equipment.id) && isFact(equipment.name, "string") && isFact(equipment.quantity, "number") &&
    isFact(equipment.available, "boolean") && isFact(equipment.capacity, "number") &&
    isFact(equipment.capacityNotes, "string"));
  const menuValid = value.menu.every((dish) => isRecord(dish) && hasKeys(dish, [
    "id", "name", "requiredSkillIds", "requiredEquipmentIds",
  ]) && isEntityId(dish.id) && isFact(dish.name, "string") &&
    isFact(dish.requiredSkillIds, "stringArray") && isFact(dish.requiredEquipmentIds, "stringArray"));
  return staffValid && skillsValid && equipmentValid && menuValid;
}

function isFact(value: unknown, kind: "string" | "number" | "boolean" | "stringArray"): value is Fact<unknown> {
  if (!isRecord(value) || !hasKeys(value, ["id", "value", "status", "sourceIds"])) return false;
  if (!isEntityId(value.id) || !["unknown", "confirmed", "unverified"].includes(String(value.status))) return false;
  if (!isStringArray(value.sourceIds, 100)) return false;
  if (value.status === "unknown") return value.value === null;
  if (value.value === null) return false;
  if (kind === "string") return isBoundedString(value.value, 1, MAX_TEXT_CHARS);
  if (kind === "number") return typeof value.value === "number" && Number.isFinite(value.value);
  if (kind === "boolean") return typeof value.value === "boolean";
  return isStringArray(value.value, 100);
}

function isSources(value: unknown): value is Source[] {
  return isBoundedArray(value) && value.every((source) => isRecord(source) && hasKeys(source, [
    "id", "kind", "text", "fileName", "location",
  ]) && isEntityId(source.id) && ["owner_message", "owner_edit", "menu_upload", "ai_inference", "owner_confirmation"].includes(String(source.kind)) &&
    isBoundedString(source.text, 1, MAX_TEXT_CHARS) && nullableString(source.fileName, 300) && nullableString(source.location, 300));
}

function isMessages(value: unknown): boolean {
  return Array.isArray(value) && value.length <= MAX_MESSAGES && value.every((message) => isRecord(message) &&
    hasKeys(message, ["id", "role", "text"]) && isEntityId(message.id) &&
    ["user", "assistant"].includes(String(message.role)) && isBoundedString(message.text, 1, MAX_TEXT_CHARS));
}

function isConflicts(value: unknown): value is Conflict[] {
  return isBoundedArray(value) && value.every((conflict) => isRecord(conflict) && hasKeys(conflict, [
    "id", "factId", "proposedValue", "sourceIds", "explanation",
  ]) && isEntityId(conflict.id) && isEntityId(conflict.factId) && isConflictValue(conflict.proposedValue) &&
    isStringArray(conflict.sourceIds, 100) && isBoundedString(conflict.explanation, 1, 1_000));
}

function isTopics(value: unknown): boolean {
  return isBoundedArray(value) && value.every((topic) => isRecord(topic) && hasKeys(topic, ["id", "status", "sourceIds"]) &&
    isEntityId(topic.id) && ["answered", "unknown", "skipped"].includes(String(topic.status)) && isStringArray(topic.sourceIds, 100));
}

function isQuestion(value: unknown): value is OnboardingQuestion {
  return isRecord(value) && hasKeys(value, ["id", "topicId", "text", "essential", "revisitReason", "quickReplies"]) &&
    isEntityId(value.id) && isEntityId(value.topicId) && isBoundedString(value.text, 1, 1_000) &&
    typeof value.essential === "boolean" && nullableString(value.revisitReason, 1_000) &&
    Array.isArray(value.quickReplies) && value.quickReplies.length <= 8 && value.quickReplies.every((reply) =>
      isRecord(reply) && hasKeys(reply, ["id", "label", "answer"]) && isEntityId(reply.id) &&
      isBoundedString(reply.label, 1, 100) && isBoundedString(reply.answer, 1, 500));
}

function isReview(value: unknown): boolean {
  return isRecord(value) && hasKeys(value, ["summary", "unknowns"]) && isBoundedString(value.summary, 1, MAX_TEXT_CHARS) &&
    isStringArray(value.unknowns, 200);
}

function isConfirmation(value: unknown): boolean {
  return isRecord(value) && hasKeys(value, ["profileRevision", "sourceId"]) &&
    isNonnegativeInteger(value.profileRevision) && isEntityId(value.sourceId);
}

function isReadiness(value: unknown): boolean {
  return isRecord(value) && hasKeys(value, ["status", "task", "blockingFactIds", "reason"]) &&
    ["task_unspecified", "rules_pending"].includes(String(value.status)) && nullableString(value.task, MAX_TEXT_CHARS) &&
    isStringArray(value.blockingFactIds, 500) && isBoundedString(value.reason, 1, 1_000);
}

function isAction(value: unknown): value is OnboardingAction {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "message":
      return hasKeys(value, ["type", "messageId", "text", "questionId", "quickReplyId"]) &&
        isEntityId(value.messageId) && isBoundedString(value.text, 1, MAX_TEXT_CHARS) &&
        nullableId(value.questionId) && nullableId(value.quickReplyId);
    case "answer_status":
      return hasKeys(value, ["type", "questionId", "status"]) && isEntityId(value.questionId) &&
        ["unknown", "skipped"].includes(String(value.status));
    case "edit_fact":
      return hasKeys(value, ["type", "factId", "value"]) && isEntityId(value.factId) && isEditableValue(value.value);
    case "add_entity":
      return hasKeys(value, ["type", "collection", "name"]) && ["staff", "skills", "equipment", "menu"].includes(String(value.collection)) &&
        isBoundedString(value.name, 1, 300);
    case "remove_entity":
      return hasKeys(value, ["type", "collection", "entityId"]) && ["staff", "skills", "equipment", "menu"].includes(String(value.collection)) &&
        isEntityId(value.entityId);
    case "confirm_facts":
      return hasKeys(value, ["type", "factIds"]) && isStringArray(value.factIds, 100);
    case "resolve_conflict":
      return hasKeys(value, ["type", "conflictId", "choice"]) && isEntityId(value.conflictId) &&
        ["keep_current", "use_proposed"].includes(String(value.choice));
    case "request_review":
      return hasKeys(value, ["type"]);
    case "confirm_profile":
      return hasKeys(value, ["type", "profileRevision"]) && isNonnegativeInteger(value.profileRevision);
    default:
      return false;
  }
}

function invalid(message: string): RequestValidationResult {
  return { ok: false, message, factIds: [] };
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function nullableString(value: unknown, maximum: number): boolean {
  return value === null || isBoundedString(value, 1, maximum);
}

function nullableId(value: unknown): boolean {
  return value === null || isEntityId(value);
}

function isEntityId(value: unknown): value is string {
  return isBoundedString(value, 1, 200);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isBoundedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_ENTITIES;
}

function isStringArray(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => isBoundedString(item, 1, MAX_TEXT_CHARS));
}

function isEditableValue(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) || isStringArray(value, 100);
}

function isConflictValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) || isStringArray(value, 100);
}

function uniqueIds(items: unknown[]): boolean {
  const ids = items.map((item) => (item as { id: string }).id);
  return new Set(ids).size === ids.length;
}
