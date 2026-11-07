import assert from "node:assert/strict";
import test from "node:test";

import { sampleOnboardingProfile } from "../../data/sample-onboarding-profile";
import {
  calculateStaffingCoverage,
  checkStationCapacity,
  confirmedAssignments,
  confirmedAvailableEmployeeIds,
  detectMissingOperationalInformation,
  employeeSkillMatch,
  equipmentCompatibility,
} from "./resources";

test("normal restaurant operations cover all five sample dishes", () => {
  const available = confirmedAvailableEmployeeIds(sampleOnboardingProfile);
  const coverage = calculateStaffingCoverage(sampleOnboardingProfile, {
    availableEmployeeIds: available,
    assignments: confirmedAssignments(sampleOnboardingProfile, available),
  });

  assert.equal(coverage.availableStaffCount, 3);
  assert.equal(coverage.feasibleMenuItemCount, 5);
  assert.equal(coverage.uncertainMenuItemCount, 0);
  assert.equal(coverage.menuCoveragePercent, 100);
});

test("skill, equipment, and station checks use confirmed facts", () => {
  const maya = sampleOnboardingProfile.staff.find((employee) => employee.id === "staff-maya")!;
  const grill = sampleOnboardingProfile.equipment.find((equipment) => equipment.id === "equipment-grill")!;

  assert.equal(employeeSkillMatch(maya, ["skill-grill", "skill-steak"]).status, "satisfied");
  assert.equal(employeeSkillMatch(maya, ["skill-batter"]).status, "blocked");
  assert.equal(checkStationCapacity(grill, 4).status, "satisfied");
  assert.equal(checkStationCapacity(grill, 5).status, "blocked");
  assert.equal(equipmentCompatibility(sampleOnboardingProfile, ["equipment-grill"]).status, "satisfied");
});

test("equipment unavailable blocks compatible dishes", () => {
  const profile = structuredClone(sampleOnboardingProfile);
  const grill = profile.equipment.find((equipment) => equipment.id === "equipment-grill")!;
  grill.available.value = false;

  const available = confirmedAvailableEmployeeIds(profile);
  const coverage = calculateStaffingCoverage(profile, {
    availableEmployeeIds: available,
    assignments: confirmedAssignments(profile, available),
  });

  assert.equal(coverage.feasibleMenuItemCount, 2);
  assert.equal(coverage.menuCoveragePercent, 40);
  assert.deepEqual(coverage.feasibleDishIds.sort(), ["dish-fish-chips", "dish-fries"]);
});

test("incomplete profile data is uncertainty, not confirmed capability", () => {
  const profile = structuredClone(sampleOnboardingProfile);
  const leo = profile.staff.find((employee) => employee.id === "staff-leo")!;
  const grill = profile.equipment.find((equipment) => equipment.id === "equipment-grill")!;
  leo.skillIds = { ...leo.skillIds, value: null, status: "unknown", sourceIds: [] };
  grill.capacity = { ...grill.capacity, value: null, status: "unknown", sourceIds: [] };

  const missing = detectMissingOperationalInformation(profile);
  const available = confirmedAvailableEmployeeIds(profile);
  const coverage = calculateStaffingCoverage(profile, {
    availableEmployeeIds: available,
    assignments: confirmedAssignments(profile, available),
  });

  assert.ok(missing.some((item) => item.factId === leo.skillIds.id));
  assert.ok(missing.some((item) => item.factId === grill.capacity.id));
  assert.ok(coverage.uncertainMenuItemCount > 0);
  assert.ok(coverage.feasibleMenuItemCount < profile.menu.length);
});
