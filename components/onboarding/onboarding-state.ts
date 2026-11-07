import type { Fact, OnboardingState } from "@/types/api";

export function createOnboardingState(): OnboardingState {
  const unknown = <T>(id: string): Fact<T> => ({ id, value: null, status: "unknown", sourceIds: [] });
  return {
    schemaVersion: 1, sessionId: crypto.randomUUID(), revision: 0, profileRevision: 0,
    profile: {
      restaurant: { name: unknown("restaurant-name"), cuisine: unknown("restaurant-cuisine"), immediateGoal: unknown("restaurant-goal"), reportedStaffCount: unknown("restaurant-staff-count") },
      staff: [], skills: [], equipment: [], menu: [],
    },
    sources: [], messages: [], conflicts: [], topics: [], question: null, review: null, confirmation: null,
    readiness: { status: "task_unspecified", task: null, blockingFactIds: [], reason: "Tell us what you need help with." },
  };
}

function record(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function strings(v: unknown): v is string[] { return Array.isArray(v) && v.every((s) => typeof s === "string"); }
function integer(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function fact(v: unknown, kind: "string" | "number" | "boolean" | "list"): boolean {
  if (!record(v) || typeof v.id !== "string" || !strings(v.sourceIds)) return false;
  if (v.status === "unknown") return v.value === null;
  if (v.status !== "confirmed" && v.status !== "unverified") return false;
  if (!v.sourceIds.length) return false;
  return kind === "list" ? strings(v.value) : kind === "number" ? integer(v.value) : typeof v.value === kind;
}
function entities(v: unknown, fields: Record<string, "string" | "number" | "boolean" | "list">): boolean {
  return Array.isArray(v) && v.every((row) => record(row) && typeof row.id === "string" && Object.entries(fields).every(([key, type]) => fact(row[key], type)));
}

// Client boundary check; backend remains authoritative for strict validation,
// fact references, evidence, feasibility, and merge semantics.
export function isOnboardingState(v: unknown): v is OnboardingState {
  if (!record(v) || v.schemaVersion !== 1 || typeof v.sessionId !== "string" || !integer(v.revision) || !integer(v.profileRevision)) return false;
  if (!record(v.profile) || !record(v.profile.restaurant)) return false;
  const p = v.profile;
  const r = v.profile.restaurant;
  if (!fact(r.name, "string") || !fact(r.cuisine, "string") || !fact(r.immediateGoal, "string") || !fact(r.reportedStaffCount, "number")) return false;
  if (!entities(p.staff, { name: "string", role: "string", available: "boolean", skillIds: "list", assignedStationId: "string" }) ||
    !entities(p.skills, { name: "string" }) || !entities(p.equipment, { name: "string", quantity: "number", available: "boolean", capacity: "number", capacityNotes: "string" }) ||
    !entities(p.menu, { name: "string", requiredSkillIds: "list", requiredEquipmentIds: "list" })) return false;
  if (!Array.isArray(v.messages) || !v.messages.every((m) => record(m) && typeof m.id === "string" && ["user", "assistant"].includes(String(m.role)) && typeof m.text === "string")) return false;
  if (!Array.isArray(v.sources) || !v.sources.every((s) => record(s) && typeof s.id === "string" && typeof s.text === "string" && ["owner_message", "owner_edit", "menu_upload", "ai_inference", "owner_confirmation"].includes(String(s.kind)) && (s.fileName === null || typeof s.fileName === "string") && (s.location === null || typeof s.location === "string"))) return false;
  if (!Array.isArray(v.conflicts) || !v.conflicts.every((c) => record(c) && typeof c.id === "string" && typeof c.factId === "string" && typeof c.explanation === "string" && strings(c.sourceIds) && (strings(c.proposedValue) || ["string", "number", "boolean"].includes(typeof c.proposedValue)))) return false;
  if (!Array.isArray(v.topics) || !v.topics.every((t) => record(t) && typeof t.id === "string" && ["answered", "unknown", "skipped"].includes(String(t.status)) && strings(t.sourceIds))) return false;
  if (v.question !== null) {
    const q = v.question;
    if (!record(q) || typeof q.id !== "string" || typeof q.topicId !== "string" || typeof q.text !== "string" || typeof q.essential !== "boolean" || (q.revisitReason !== null && typeof q.revisitReason !== "string") || !Array.isArray(q.quickReplies) || !q.quickReplies.every((a) => record(a) && typeof a.id === "string" && typeof a.label === "string" && typeof a.answer === "string")) return false;
  }
  if (v.review !== null && (!record(v.review) || typeof v.review.summary !== "string" || !strings(v.review.unknowns))) return false;
  if (v.confirmation !== null && (!record(v.confirmation) || !integer(v.confirmation.profileRevision) || typeof v.confirmation.sourceId !== "string")) return false;
  return record(v.readiness) && ["task_unspecified", "rules_pending"].includes(String(v.readiness.status)) && (v.readiness.task === null || typeof v.readiness.task === "string") && strings(v.readiness.blockingFactIds) && typeof v.readiness.reason === "string";
}
