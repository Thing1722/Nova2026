import assert from "node:assert/strict";
import test from "node:test";

import { sampleOnboardingProfile } from "../../data/sample-onboarding-profile";
import { analyzeStaffingEmergency } from "./staffing-emergency";

test("one chef unavailable produces before, immediate, and recovery coverage", () => {
  const result = analyzeStaffingEmergency(sampleOnboardingProfile, "staff-maya");

  assert.equal(result.unavailableEmployee.employeeName, "Maya Chen");
  assert.equal(result.unavailableEmployee.stationId, "equipment-grill");
  assert.deepEqual(result.unavailableEmployee.dishIds.sort(), ["dish-burger", "dish-steak", "dish-vegetables"]);
  assert.equal(result.coverage.beforeDisruption.menuCoveragePercent, 100);
  assert.equal(result.coverage.immediatelyAfter.menuCoveragePercent, 40);
  assert.equal(result.coverage.afterRecovery.menuCoveragePercent, 60);
});

test("qualified replacement is reassigned without simultaneous double-booking", () => {
  const result = analyzeStaffingEmergency(sampleOnboardingProfile, "staff-maya");
  const leo = result.qualifiedReplacements.find((candidate) => candidate.employeeId === "staff-leo");

  assert.ok(leo);
  assert.ok(leo.responsibilitySkillIdsCovered.includes("skill-grill"));
  assert.equal(result.recommendedArrangement.assignments["staff-leo"], "equipment-grill");
  assert.equal(Object.keys(result.recommendedArrangement.assignments).length, 2);
  assert.deepEqual(result.recommendedArrangement.recoveredDishIds.sort(), ["dish-burger", "dish-vegetables"]);
  assert.deepEqual(result.recommendedArrangement.displacedDishIds, ["dish-fish-chips"]);
});

test("no qualified replacement preserves the immediate arrangement", () => {
  const profile = structuredClone(sampleOnboardingProfile);
  const leo = profile.staff.find((employee) => employee.id === "staff-leo")!;
  leo.skillIds.value = ["skill-fry", "skill-batter"];

  const result = analyzeStaffingEmergency(profile, "staff-maya");

  assert.equal(result.qualifiedReplacements.length, 0);
  assert.equal(result.recommendedArrangement.assignmentChanges.length, 0);
  assert.equal(result.coverage.immediatelyAfter.menuCoveragePercent, 40);
  assert.equal(result.coverage.afterRecovery.menuCoveragePercent, 40);
  assert.ok(result.staffingGaps.some((gap) => gap.resourceId === "skill-grill"));
});

test("unavailable equipment prevents reassignment to that station", () => {
  const profile = structuredClone(sampleOnboardingProfile);
  const grill = profile.equipment.find((equipment) => equipment.id === "equipment-grill")!;
  grill.available.value = false;

  const result = analyzeStaffingEmergency(profile, "staff-maya");

  assert.equal(result.targetStationCheck?.status, "blocked");
  assert.equal(result.qualifiedReplacements.length, 0);
  assert.equal(result.coverage.beforeDisruption.menuCoveragePercent, 40);
  assert.equal(result.coverage.afterRecovery.menuCoveragePercent, 40);
});

test("incomplete profile reports uncertainty and does not assume a replacement", () => {
  const profile = structuredClone(sampleOnboardingProfile);
  const leo = profile.staff.find((employee) => employee.id === "staff-leo")!;
  const grill = profile.equipment.find((equipment) => equipment.id === "equipment-grill")!;
  leo.skillIds = { ...leo.skillIds, value: null, status: "unknown", sourceIds: [] };
  grill.capacity = { ...grill.capacity, value: null, status: "unknown", sourceIds: [] };

  const result = analyzeStaffingEmergency(profile, "staff-maya");

  assert.equal(result.targetStationCheck?.status, "unknown");
  assert.equal(result.qualifiedReplacements.length, 0);
  assert.ok(result.missingInformation.some((item) => item.factId === leo.skillIds.id));
  assert.ok(result.missingInformation.some((item) => item.factId === grill.capacity.id));
  assert.ok(result.coverage.beforeDisruption.uncertainMenuItemCount > 0);
});
