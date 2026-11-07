import type {
  OnboardingQuestion,
  OnboardingReadiness,
  OnboardingReview,
  OnboardingState,
  OnboardingTopic,
  Profile,
} from "../../types/api";

interface QuestionCandidate {
  topicId: string;
  text: string;
  essential: boolean;
  area: "goal" | "staff" | "equipment" | "menu" | "restaurant";
  quickReplies: Array<{ label: string; answer: string }>;
}

export function selectNextQuestion(state: OnboardingState): OnboardingQuestion | null {
  const conflict = state.conflicts[0];
  if (conflict) {
    return question(state, {
      topicId: `conflict:${conflict.factId}`,
      text: conflict.explanation,
      essential: true,
      area: "goal",
      quickReplies: [],
    }, null);
  }

  const candidates = prioritizeCandidates(buildCandidates(state.profile), state.profile.restaurant.immediateGoal.value);
  for (const candidate of candidates) {
    const topic = state.topics.find((item) => item.id === candidate.topicId);
    if (topic?.status === "skipped" || topic?.status === "unknown") continue;
    const revisitReason = topic?.status === "answered"
      ? "This profile detail changed and is unknown again."
      : null;
    return question(state, candidate, revisitReason);
  }
  return null;
}

export function calculateReadiness(profile: Profile): OnboardingReadiness {
  const goal = profile.restaurant.immediateGoal;
  if (goal.status !== "confirmed" || goal.value === null) {
    return {
      status: "task_unspecified",
      task: null,
      blockingFactIds: [goal.id],
      reason: "The owner has not confirmed which operational task they want help with.",
    };
  }
  return {
    status: "rules_pending",
    task: goal.value,
    blockingFactIds: [],
    reason: "The goal is known, but task-specific operational readiness rules are not defined in Phase 1.",
  };
}

export function buildReview(state: OnboardingState): OnboardingReview {
  const profile = state.profile;
  const parts: string[] = [];
  if (confirmed(profile.restaurant.name)) parts.push(`Restaurant: ${profile.restaurant.name.value}`);
  if (confirmed(profile.restaurant.cuisine)) parts.push(`Cuisine: ${profile.restaurant.cuisine.value}`);
  if (confirmed(profile.restaurant.immediateGoal)) parts.push(`Goal: ${profile.restaurant.immediateGoal.value}`);
  if (confirmed(profile.restaurant.reportedStaffCount)) parts.push(`Reported staff: ${profile.restaurant.reportedStaffCount.value}`);
  if (profile.staff.length > 0) parts.push(`Staff profiles: ${profile.staff.map((member) => member.name.value ?? "unnamed").join(", ")}`);
  if (profile.equipment.length > 0) parts.push(`Equipment: ${profile.equipment.map((item) => item.name.value ?? "unnamed").join(", ")}`);
  if (profile.menu.length > 0) parts.push(`Menu: ${profile.menu.map((dish) => dish.name.value ?? "unnamed").join(", ")}`);

  const summary = parts.length > 0 ? parts.join(". ") + "." : "No restaurant facts have been confirmed yet.";
  return {
    summary: summary.slice(0, 5_000),
    unknowns: collectUnknowns(profile, state),
  };
}

export function upsertTopic(
  topics: OnboardingTopic[],
  id: string,
  status: OnboardingTopic["status"],
  sourceId?: string,
): OnboardingTopic[] {
  const result = topics.map((topic) => ({ ...topic, sourceIds: [...topic.sourceIds] }));
  const existing = result.find((topic) => topic.id === id);
  if (existing) {
    existing.status = status;
    if (sourceId && !existing.sourceIds.includes(sourceId)) existing.sourceIds.push(sourceId);
  } else {
    result.push({ id, status, sourceIds: sourceId ? [sourceId] : [] });
  }
  return result;
}

export function isQuestionTopicSatisfied(profile: Profile, topicId: string): boolean {
  if (topicId === "restaurant-goal") return confirmed(profile.restaurant.immediateGoal);
  if (topicId === "staff-identities") {
    return profile.restaurant.reportedStaffCount.value !== null &&
      profile.staff.length >= profile.restaurant.reportedStaffCount.value;
  }
  if (topicId === "equipment") return profile.equipment.length > 0;
  if (topicId === "menu-items") return profile.menu.length > 0;
  if (topicId === "restaurant-cuisine") return confirmed(profile.restaurant.cuisine);

  const staffSkillsId = entityIdForTopic(topicId, "staff-skills:");
  if (staffSkillsId !== null) return confirmed(profile.staff.find((member) => topicEntityKey(member.id) === staffSkillsId)?.skillIds);
  const staffAvailabilityId = entityIdForTopic(topicId, "staff-availability:");
  if (staffAvailabilityId !== null) return confirmed(profile.staff.find((member) => topicEntityKey(member.id) === staffAvailabilityId)?.available);
  const equipmentCapacityId = entityIdForTopic(topicId, "equipment-capacity:");
  if (equipmentCapacityId !== null) return confirmed(profile.equipment.find((item) => topicEntityKey(item.id) === equipmentCapacityId)?.capacity);
  const menuRequirementsId = entityIdForTopic(topicId, "menu-requirements:");
  if (menuRequirementsId !== null) {
    const dish = profile.menu.find((item) => topicEntityKey(item.id) === menuRequirementsId);
    return confirmed(dish?.requiredSkillIds) && confirmed(dish?.requiredEquipmentIds);
  }

  // Accept legacy topics in state envelopes created before entity-scoped questions.
  if (topicId === "staff-skills") return profile.staff.length > 0 && profile.staff.every((member) => confirmed(member.skillIds));
  if (topicId === "staff-availability") return profile.staff.length > 0 && profile.staff.every((member) => confirmed(member.available));
  if (topicId === "equipment-capacity") return profile.equipment.length > 0 && profile.equipment.every((item) => confirmed(item.capacity));
  if (topicId === "menu-requirements") return profile.menu.length > 0 && profile.menu.every((dish) =>
    confirmed(dish.requiredSkillIds) && confirmed(dish.requiredEquipmentIds));
  return false;
}

function buildCandidates(profile: Profile): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];
  if (!confirmed(profile.restaurant.immediateGoal)) {
    candidates.push({
      topicId: "restaurant-goal",
      text: "What would you most like help with once your restaurant profile is set up?",
      essential: false,
      area: "goal",
      quickReplies: [
        { label: "Staffing", answer: "I want help with staffing." },
        { label: "Kitchen capacity", answer: "I want help with kitchen capacity." },
        { label: "Menu operations", answer: "I want help with menu operations." },
      ],
    });
  }
  if (profile.restaurant.reportedStaffCount.value !== null && profile.staff.length < profile.restaurant.reportedStaffCount.value) {
    candidates.push({
      topicId: "staff-identities",
      text: "Who are the cooks or kitchen staff you want included in the profile? Names or simple labels are both fine.",
      essential: false,
      area: "staff",
      quickReplies: [],
    });
  }
  for (const member of profile.staff.filter((item) => !confirmed(item.skillIds))) {
    const name = entityName(member.name.value, "this staff member");
    candidates.push({
      topicId: `staff-skills:${topicEntityKey(member.id)}`,
      text: `What cooking tasks can ${name} perform?`,
      essential: false,
      area: "staff",
      quickReplies: [],
    });
  }
  for (const member of profile.staff.filter((item) => !confirmed(item.available))) {
    const name = entityName(member.name.value, "this staff member");
    candidates.push({
      topicId: `staff-availability:${topicEntityKey(member.id)}`,
      text: `Is ${name} normally available for the service you want help with?`,
      essential: false,
      area: "staff",
      quickReplies: [
        { label: "Available", answer: `${name} is available.` },
        { label: "Not available", answer: `${name} is not available.` },
      ],
    });
  }
  if (profile.equipment.length === 0) {
    candidates.push({
      topicId: "equipment",
      text: "What main cooking equipment or kitchen stations do you use?",
      essential: false,
      area: "equipment",
      quickReplies: [],
    });
  }
  for (const item of profile.equipment.filter((equipment) => !confirmed(equipment.capacity))) {
    const name = entityName(item.name.value, "this station");
    candidates.push({
      topicId: `equipment-capacity:${topicEntityKey(item.id)}`,
      text: `Do you know how many dishes ${name} can handle at the same time?`,
      essential: false,
      area: "equipment",
      quickReplies: [],
    });
  }
  if (profile.menu.length === 0) {
    candidates.push({
      topicId: "menu-items",
      text: "Which existing dishes should be included in your restaurant profile?",
      essential: false,
      area: "menu",
      quickReplies: [],
    });
  }
  for (const dish of profile.menu.filter((item) =>
    !confirmed(item.requiredSkillIds) || !confirmed(item.requiredEquipmentIds))) {
    const name = entityName(dish.name.value, "this dish");
    candidates.push({
      topicId: `menu-requirements:${topicEntityKey(dish.id)}`,
      text: `What skills or equipment are required to prepare ${name}?`,
      essential: false,
      area: "menu",
      quickReplies: [],
    });
  }
  if (!confirmed(profile.restaurant.cuisine)) {
    candidates.push({
      topicId: "restaurant-cuisine",
      text: "How would you describe your restaurant's cuisine or service style?",
      essential: false,
      area: "restaurant",
      quickReplies: [],
    });
  }
  return candidates;
}

function prioritizeCandidates(candidates: QuestionCandidate[], goal: string | null): QuestionCandidate[] {
  const goalArea = classifyGoal(goal);
  const order = goalArea === "staff"
    ? ["goal", "staff", "equipment", "menu", "restaurant"]
    : goalArea === "equipment"
      ? ["goal", "equipment", "menu", "staff", "restaurant"]
      : goalArea === "menu"
        ? ["goal", "menu", "equipment", "staff", "restaurant"]
        : ["goal", "staff", "equipment", "menu", "restaurant"];
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => order.indexOf(left.candidate.area) - order.indexOf(right.candidate.area) || left.index - right.index)
    .map(({ candidate }) => candidate);
}

function classifyGoal(goal: string | null): QuestionCandidate["area"] | null {
  if (!goal) return null;
  const normalized = goal.toLocaleLowerCase();
  if (/staff|cook|chef|shift|absence|call.?out|coverage/.test(normalized)) return "staff";
  if (/menu|dish|recipe|food item/.test(normalized)) return "menu";
  if (/capacity|equipment|station|kitchen|throughput|wait|bottleneck/.test(normalized)) return "equipment";
  return null;
}

function question(
  state: OnboardingState,
  candidate: QuestionCandidate,
  revisitReason: string | null,
): OnboardingQuestion {
  const id = `question:${state.revision + 1}:${candidate.topicId}`;
  return {
    id,
    topicId: candidate.topicId,
    text: candidate.text,
    essential: candidate.essential,
    revisitReason,
    quickReplies: candidate.quickReplies.map((reply, index) => ({
      id: `${id}:reply:${index + 1}`,
      label: reply.label,
      answer: reply.answer,
    })),
  };
}

function collectUnknowns(profile: Profile, state: OnboardingState): string[] {
  const unknowns: string[] = [];
  if (!confirmed(profile.restaurant.name)) unknowns.push("Restaurant name is unknown or unverified.");
  if (!confirmed(profile.restaurant.cuisine)) unknowns.push("Cuisine is unknown or unverified.");
  if (!confirmed(profile.restaurant.immediateGoal)) unknowns.push("Immediate goal is unknown or unverified.");
  if (!confirmed(profile.restaurant.reportedStaffCount)) unknowns.push("Staff count is unknown or unverified.");
  for (const member of profile.staff) {
    const name = member.name.value ?? member.id;
    if (!confirmed(member.skillIds)) unknowns.push(`${name}'s skills are unknown or unverified.`);
    if (!confirmed(member.available)) unknowns.push(`${name}'s availability is unknown or unverified.`);
  }
  for (const item of profile.equipment) {
    if (!confirmed(item.capacity)) unknowns.push(`${item.name.value ?? item.id} capacity is unknown or unverified.`);
  }
  for (const dish of profile.menu) {
    if (!confirmed(dish.requiredSkillIds) || !confirmed(dish.requiredEquipmentIds)) {
      unknowns.push(`${dish.name.value ?? dish.id} preparation requirements are unknown or unverified.`);
    }
  }
  for (const conflict of state.conflicts) unknowns.push(`Conflict: ${conflict.explanation}`);
  return unknowns.slice(0, 200);
}

function confirmed<T>(fact: { value: T | null; status: string } | undefined): fact is { value: T; status: "confirmed" } {
  return fact?.status === "confirmed" && fact.value !== null;
}

function entityIdForTopic(topicId: string, prefix: string): string | null {
  return topicId.startsWith(prefix) && topicId.length > prefix.length ? topicId.slice(prefix.length) : null;
}

function topicEntityKey(entityId: string): string {
  if (entityId.length <= 100) return entityId;
  let hash = 2166136261;
  for (const character of entityId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${entityId.slice(0, 80)}:${(hash >>> 0).toString(36)}`;
}

function entityName(value: string | null, fallback: string): string {
  return (value ?? fallback).slice(0, 80);
}
