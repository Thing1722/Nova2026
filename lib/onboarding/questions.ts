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
  quickReplies: Array<{ label: string; answer: string }>;
}

export function selectNextQuestion(state: OnboardingState): OnboardingQuestion | null {
  const conflict = state.conflicts[0];
  if (conflict) {
    return question(state, {
      topicId: `conflict:${conflict.factId}`,
      text: conflict.explanation,
      essential: true,
      quickReplies: [],
    }, null);
  }

  const candidates = buildCandidates(state.profile);
  for (const candidate of candidates) {
    const topic = state.topics.find((item) => item.id === candidate.topicId);
    if (topic?.status === "answered" || topic?.status === "skipped" || topic?.status === "unknown") continue;
    return question(state, candidate, null);
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

function buildCandidates(profile: Profile): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];
  if (!confirmed(profile.restaurant.immediateGoal)) {
    candidates.push({
      topicId: "restaurant-goal",
      text: "What would you most like help with once your restaurant profile is set up?",
      essential: false,
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
      quickReplies: [],
    });
  }
  const staffWithoutSkills = profile.staff.filter((member) => member.skillIds.status === "unknown");
  if (staffWithoutSkills.length > 0) {
    candidates.push({
      topicId: "staff-skills",
      text: `What cooking tasks can ${joinNames(staffWithoutSkills.map((member) => member.name.value))} perform?`,
      essential: false,
      quickReplies: [],
    });
  }
  const staffWithoutAvailability = profile.staff.filter((member) => member.available.status === "unknown");
  if (staffWithoutAvailability.length > 0) {
    candidates.push({
      topicId: "staff-availability",
      text: `Is ${joinNames(staffWithoutAvailability.map((member) => member.name.value))} normally available for the service you want help with?`,
      essential: false,
      quickReplies: [
        { label: "Available", answer: "They are available." },
        { label: "Not available", answer: "They are not available." },
      ],
    });
  }
  if (profile.equipment.length === 0) {
    candidates.push({
      topicId: "equipment",
      text: "What main cooking equipment or kitchen stations do you use?",
      essential: false,
      quickReplies: [],
    });
  }
  const unknownCapacity = profile.equipment.filter((item) => item.capacity.status === "unknown");
  if (unknownCapacity.length > 0) {
    candidates.push({
      topicId: "equipment-capacity",
      text: `Do you know how many dishes ${joinNames(unknownCapacity.map((item) => item.name.value))} can handle at the same time?`,
      essential: false,
      quickReplies: [],
    });
  }
  if (profile.menu.length === 0) {
    candidates.push({
      topicId: "menu-items",
      text: "Which existing dishes should be included in your restaurant profile?",
      essential: false,
      quickReplies: [],
    });
  }
  const unknownRequirements = profile.menu.filter((dish) =>
    dish.requiredSkillIds.status === "unknown" || dish.requiredEquipmentIds.status === "unknown");
  if (unknownRequirements.length > 0) {
    candidates.push({
      topicId: "menu-requirements",
      text: `What skills or equipment are required to prepare ${joinNames(unknownRequirements.map((dish) => dish.name.value))}?`,
      essential: false,
      quickReplies: [],
    });
  }
  if (!confirmed(profile.restaurant.cuisine)) {
    candidates.push({
      topicId: "restaurant-cuisine",
      text: "How would you describe your restaurant's cuisine or service style?",
      essential: false,
      quickReplies: [],
    });
  }
  return candidates;
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

function confirmed<T>(fact: { value: T | null; status: string }): fact is { value: T; status: "confirmed" } {
  return fact.status === "confirmed" && fact.value !== null;
}

function joinNames(values: Array<string | null>): string {
  const names = values.slice(0, 3).map((value) => (value ?? "the unnamed entry").slice(0, 80));
  if (names.length <= 1) return names[0] ?? "this item";
  const joined = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return values.length > 3 ? `${joined}, and others` : joined;
}
