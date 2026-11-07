import assert from "node:assert/strict";
import test from "node:test";

import { sampleOnboardingProfile, sampleOnboardingSources } from "../data/sample-onboarding-profile";
import type { Fact, Profile, Source } from "../types/api";
import {
  createUnknownFact,
  mergeRestaurantProfile,
  validateRestaurantProfile,
} from "./restaurant-profile";

const cloneProfile = (): Profile => structuredClone(sampleOnboardingProfile);

test("partial profiles remain structurally valid and report missing facts", () => {
  const profile = cloneProfile();
  profile.restaurant.name = createUnknownFact("fact-restaurant-name");
  profile.staff[0].available = createUnknownFact("fact-staff-maya-available");

  const result = validateRestaurantProfile(profile, sampleOnboardingSources);

  assert.equal(result.valid, true);
  assert.ok(result.missingData.some((issue) => issue.factId === "fact-restaurant-name"));
  assert.ok(result.missingData.some((issue) => issue.factId === "fact-staff-maya-available"));
});

test("profile merging preserves omitted fields and adds array information", () => {
  const profile = cloneProfile();
  const update = cloneProfile();
  update.restaurant.name = createUnknownFact("fact-restaurant-name");
  update.staff[0].skillIds = confirmedFact(
    "fact-staff-maya-skills",
    ["skill-grill", "skill-steak", "skill-fry"],
    "source-owner-update",
  );
  update.skills.push({
    id: "skill-new",
    name: confirmedFact("fact-skill-new-name", "New skill", "source-owner-update"),
  });
  update.staff[0].skillIds.value = ["skill-new"];

  const result = mergeRestaurantProfile(profile, { restaurant: update.restaurant, staff: update.staff, skills: update.skills });

  assert.equal(result.profile.restaurant.name.value, "Maple Street Grill");
  assert.deepEqual(result.profile.staff[0].skillIds.value, ["skill-grill", "skill-steak", "skill-new"]);
  assert.equal(result.profile.skills.at(-1)?.id, "skill-new");
});

test("ambiguous contradictions preserve accepted facts and create conflicts", () => {
  const profile = cloneProfile();
  const proposed = confirmedFact("fact-restaurant-staff-count", 4, "source-ambiguous-message");

  const result = mergeRestaurantProfile(profile, {
    restaurant: { reportedStaffCount: proposed },
  });

  assert.equal(result.profile.restaurant.reportedStaffCount.value, 3);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].factId, "fact-restaurant-staff-count");
  assert.equal(result.conflicts[0].proposedValue, 4);
});

test("explicit owner corrections replace a fact, resolve conflicts, and preserve staff", () => {
  const profile = cloneProfile();
  profile.restaurant.reportedStaffCount.value = 4;
  const correctionSource: Source = {
    id: "source-owner-correction",
    kind: "owner_edit",
    text: "Actually, we have three cooks, not four.",
    fileName: null,
    location: null,
  };
  const factId = profile.restaurant.reportedStaffCount.id;
  const existingConflict = {
    id: "conflict-old-count",
    factId,
    proposedValue: 3,
    sourceIds: [correctionSource.id],
    explanation: "The reported count changed.",
  };

  const result = mergeRestaurantProfile(
    profile,
    { restaurant: { reportedStaffCount: confirmedFact(factId, 3, correctionSource.id) } },
    [existingConflict],
    { correctionFactIds: [factId] },
  );

  assert.equal(result.profile.restaurant.reportedStaffCount.value, 3);
  assert.equal(result.profile.restaurant.reportedStaffCount.status, "confirmed");
  assert.deepEqual(result.profile.restaurant.reportedStaffCount.sourceIds, [correctionSource.id]);
  assert.equal(result.profile.staff.length, 3);
  assert.deepEqual(result.conflicts, []);
});

test("validation reports dangling references, conflicts, and prohibited capability inference", () => {
  const profile = cloneProfile();
  const inference: Source = {
    id: "source-ai-inference",
    kind: "ai_inference",
    text: "AI guessed that Maya is unavailable.",
    fileName: null,
    location: null,
  };
  profile.staff[0].available = {
    id: "fact-staff-maya-available",
    value: false,
    status: "unverified",
    sourceIds: [inference.id],
  };
  profile.menu[0].requiredEquipmentIds.value = ["equipment-does-not-exist"];
  const conflicts = [
    {
      id: "conflict-cuisine",
      factId: profile.restaurant.cuisine.id,
      proposedValue: "French",
      sourceIds: [sampleOnboardingSources[0].id],
      explanation: "Two cuisines were reported.",
    },
  ];

  const result = validateRestaurantProfile(profile, [...sampleOnboardingSources, inference], conflicts);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "FORBIDDEN_CAPABILITY_INFERENCE"));
  assert.ok(result.issues.some((issue) => issue.code === "UNKNOWN_EQUIPMENT_REFERENCE"));
  assert.ok(result.issues.some((issue) => issue.code === "UNRESOLVED_CONFLICT"));
});

test("the realistic sample has three chefs, two stations, five dishes, and valid references", () => {
  const result = validateRestaurantProfile(sampleOnboardingProfile, sampleOnboardingSources);

  assert.equal(sampleOnboardingProfile.staff.length, 3);
  assert.equal(sampleOnboardingProfile.equipment.length, 2);
  assert.equal(sampleOnboardingProfile.menu.length, 5);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues.filter((issue) => issue.severity === "error"), []);
});

function confirmedFact<T>(id: string, value: T, sourceId: string): Fact<T> {
  return { id, value, status: "confirmed", sourceIds: [sourceId] };
}
