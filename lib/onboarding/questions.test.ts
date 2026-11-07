import assert from "node:assert/strict";
import test from "node:test";

import { sampleOnboardingProfile } from "../../data/sample-onboarding-profile";
import type { Fact, OnboardingState, ProfileStaffMember } from "../../types/api";
import { createInitialOnboardingState } from "./state";
import { isQuestionTopicSatisfied, selectNextQuestion } from "./questions";

test("asks about one employee at a time with an entity-scoped topic", () => {
  const state = stateWithGoal("staffing help");
  const first = unknownStaff("staff-alex", "Alex");
  const second = unknownStaff("staff-sam", "Sam");
  state.profile.staff.push(first, second);

  const firstQuestion = selectNextQuestion(state);
  assert.equal(firstQuestion?.topicId, "staff-skills:staff-alex");
  assert.equal(firstQuestion?.text, "What cooking tasks can Alex perform?");

  state.topics.push({ id: firstQuestion!.topicId, status: "skipped", sourceIds: [] });
  const secondQuestion = selectNextQuestion(state);
  assert.equal(secondQuestion?.topicId, "staff-skills:staff-sam");
});

test("a newly added employee is not suppressed by an older employee's answered topic", () => {
  const state = stateWithGoal("staffing coverage");
  state.topics.push({ id: "staff-skills:staff-maya", status: "answered", sourceIds: [] });
  state.profile.staff.push(unknownStaff("staff-new", "New Cook"));

  assert.equal(selectNextQuestion(state)?.topicId, "staff-skills:staff-new");
});

test("revisits an answered entity topic when a later edit makes the fact unknown", () => {
  const state = stateWithGoal("staffing help");
  state.profile.staff[0].skillIds = unknown<string[]>(state.profile.staff[0].skillIds.id);
  state.topics.push({ id: "staff-skills:staff-maya", status: "answered", sourceIds: [] });

  const question = selectNextQuestion(state);

  assert.equal(question?.topicId, "staff-skills:staff-maya");
  assert.equal(question?.revisitReason, "This profile detail changed and is unknown again.");
});

test("menu goals prioritize dish requirements over unrelated missing details", () => {
  const state = stateWithGoal("menu operations");
  state.profile.staff[0].skillIds = unknown<string[]>(state.profile.staff[0].skillIds.id);
  state.profile.equipment[0].capacity = unknown<number>(state.profile.equipment[0].capacity.id);
  state.profile.menu[0].requiredSkillIds = unknown<string[]>(state.profile.menu[0].requiredSkillIds.id);

  assert.equal(selectNextQuestion(state)?.topicId, "menu-requirements:dish-steak");
});

test("kitchen-capacity goals prioritize a specific station capacity", () => {
  const state = stateWithGoal("kitchen capacity and bottlenecks");
  state.profile.staff[0].skillIds = unknown<string[]>(state.profile.staff[0].skillIds.id);
  state.profile.equipment[0].capacity = unknown<number>(state.profile.equipment[0].capacity.id);
  state.profile.menu[0].requiredSkillIds = unknown<string[]>(state.profile.menu[0].requiredSkillIds.id);

  assert.equal(selectNextQuestion(state)?.topicId, "equipment-capacity:equipment-grill");
});

test("availability quick replies name the employee explicitly", () => {
  const state = stateWithGoal("staffing help");
  state.profile.staff[0].available = unknown<boolean>(state.profile.staff[0].available.id);

  const question = selectNextQuestion(state);

  assert.equal(question?.topicId, "staff-availability:staff-maya");
  assert.deepEqual(question?.quickReplies.map((reply) => reply.answer), [
    "Maya Chen is available.",
    "Maya Chen is not available.",
  ]);
});

test("scoped topic satisfaction checks only the referenced entity", () => {
  const state = stateWithGoal("staffing help");
  state.profile.staff[1].skillIds = unknown<string[]>(state.profile.staff[1].skillIds.id);

  assert.equal(isQuestionTopicSatisfied(state.profile, "staff-skills:staff-maya"), true);
  assert.equal(isQuestionTopicSatisfied(state.profile, "staff-skills:staff-leo"), false);
});

function stateWithGoal(goal: string): OnboardingState {
  const state = createInitialOnboardingState(`question-test-${goal}`);
  state.profile = structuredClone(sampleOnboardingProfile);
  state.profile.restaurant.immediateGoal = confirmed("fact-restaurant-goal", goal);
  return state;
}

function unknownStaff(id: string, name: string): ProfileStaffMember {
  return {
    id,
    name: confirmed(`fact-${id}-name`, name),
    role: unknown<string>(`fact-${id}-role`),
    available: confirmed(`fact-${id}-available`, true),
    skillIds: unknown<string[]>(`fact-${id}-skills`),
    assignedStationId: unknown<string>(`fact-${id}-station`),
  };
}

function confirmed<T>(id: string, value: T): Fact<T> {
  return { id, value, status: "confirmed", sourceIds: ["source-test"] };
}

function unknown<T>(id: string): Fact<T> {
  return { id, value: null, status: "unknown", sourceIds: [] };
}
