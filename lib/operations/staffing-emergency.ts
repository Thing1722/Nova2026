import type { Profile, ProfileMenuItem, ProfileStaffMember } from "../../types/api";
import {
  calculateStaffingCoverage,
  checkStationCapacity,
  confirmedAssignments,
  confirmedAvailableEmployeeIds,
  confirmedValue,
  detectMissingOperationalInformation,
  type MenuItemFeasibility,
  type MissingOperationalInformation,
  type StaffingCoverage,
  type StationCapacityCheck,
} from "./resources";

export interface UnavailableEmployeeResponsibilities {
  employeeId: string;
  employeeName: string;
  role: string | null;
  stationId: string | null;
  confirmedSkillIds: string[];
  dishIds: string[];
}

export interface QualifiedReplacement {
  employeeId: string;
  employeeName: string;
  confirmedSkillIds: string[];
  responsibilitySkillIdsCovered: string[];
  potentiallyRecoverableDishIds: string[];
}

export interface AssignmentChange {
  employeeId: string;
  fromStationId: string | null;
  toStationId: string | null;
}

export interface ArrangementEvaluation {
  id: string;
  assignments: Record<string, string | null>;
  assignmentChanges: AssignmentChange[];
  coverage: StaffingCoverage;
  recoveredDishIds: string[];
  displacedDishIds: string[];
}

export interface StaffingGap {
  kind: "skill" | "equipment" | "information";
  resourceId: string;
  dishIds: string[];
  reason: string;
}

export interface AffectedDish {
  dishId: string;
  dishName: string;
  beforeDisruption: MenuItemFeasibility["status"];
  immediatelyAfter: MenuItemFeasibility["status"];
  afterRecovery: MenuItemFeasibility["status"];
  reasons: string[];
}

export interface StaffingEmergencyAnalysis {
  unavailableEmployee: UnavailableEmployeeResponsibilities;
  remainingAvailableEmployeeIds: string[];
  qualifiedReplacements: QualifiedReplacement[];
  targetStationCheck: StationCapacityCheck | null;
  arrangementsCompared: ArrangementEvaluation[];
  recommendedArrangement: ArrangementEvaluation;
  coverage: {
    beforeDisruption: StaffingCoverage;
    immediatelyAfter: StaffingCoverage;
    afterRecovery: StaffingCoverage;
  };
  staffingGaps: StaffingGap[];
  affectedDishes: AffectedDish[];
  operationalTradeOffs: string[];
  missingInformation: MissingOperationalInformation[];
}

export class OperationalInputError extends Error {}

/**
 * Small exhaustive comparison for one absent employee. It only reassigns
 * confirmed, available employees to the absent employee's confirmed station.
 */
export function analyzeStaffingEmergency(
  profile: Profile,
  unavailableEmployeeId: string,
): StaffingEmergencyAnalysis {
  const unavailable = profile.staff.find((employee) => employee.id === unavailableEmployeeId);
  if (!unavailable) throw new OperationalInputError(`Employee ${unavailableEmployeeId} does not exist.`);

  const baselineAvailable = confirmedAvailableEmployeeIds(profile);
  const remainingAvailable = new Set([...baselineAvailable].filter((id) => id !== unavailableEmployeeId));
  const baselineAssignments = confirmedAssignments(profile, baselineAvailable);
  const immediateAssignments = confirmedAssignments(profile, remainingAvailable);
  const beforeDisruption = calculateStaffingCoverage(profile, {
    availableEmployeeIds: baselineAvailable,
    assignments: baselineAssignments,
  });
  const immediatelyAfter = calculateStaffingCoverage(profile, {
    availableEmployeeIds: remainingAvailable,
    assignments: immediateAssignments,
  });

  const responsibilities = identifyResponsibilities(profile, unavailable, beforeDisruption);
  const targetStation = responsibilities.stationId
    ? profile.equipment.find((equipment) => equipment.id === responsibilities.stationId) ?? null
    : null;
  const targetStationCheck = targetStation ? checkStationCapacity(targetStation) : null;
  const candidates = findQualifiedReplacements(
    profile,
    remainingAvailable,
    responsibilities,
    targetStationCheck,
  );
  const arrangements = compareArrangements(
    profile,
    remainingAvailable,
    immediateAssignments,
    immediatelyAfter,
    responsibilities.stationId,
    candidates,
  );
  const recommendedArrangement = chooseBestArrangement(arrangements);
  const afterRecovery = recommendedArrangement.coverage;

  return {
    unavailableEmployee: responsibilities,
    remainingAvailableEmployeeIds: [...remainingAvailable].sort(),
    qualifiedReplacements: candidates,
    targetStationCheck,
    arrangementsCompared: arrangements,
    recommendedArrangement,
    coverage: { beforeDisruption, immediatelyAfter, afterRecovery },
    staffingGaps: buildStaffingGaps(profile, afterRecovery.dishResults),
    affectedDishes: buildAffectedDishes(
      profile,
      beforeDisruption.dishResults,
      immediatelyAfter.dishResults,
      afterRecovery.dishResults,
    ),
    operationalTradeOffs: buildTradeOffs(profile, responsibilities, recommendedArrangement, targetStationCheck),
    missingInformation: detectMissingOperationalInformation(profile),
  };
}

function identifyResponsibilities(
  profile: Profile,
  unavailable: ProfileStaffMember,
  baseline: StaffingCoverage,
): UnavailableEmployeeResponsibilities {
  const skillIds = confirmedValue(unavailable.skillIds) ?? [];
  const stationId = confirmedValue(unavailable.assignedStationId);
  const baselineFeasible = new Set(baseline.feasibleDishIds);
  const dishIds = profile.menu.filter((dish) => {
    if (!baselineFeasible.has(dish.id)) return false;
    const requiredSkills = confirmedValue(dish.requiredSkillIds) ?? [];
    const requiredEquipment = confirmedValue(dish.requiredEquipmentIds) ?? [];
    return (stationId !== null && requiredEquipment.includes(stationId)) ||
      requiredSkills.some((skillId) => skillIds.includes(skillId));
  }).map((dish) => dish.id);

  return {
    employeeId: unavailable.id,
    employeeName: confirmedValue(unavailable.name) ?? unavailable.id,
    role: confirmedValue(unavailable.role),
    stationId,
    confirmedSkillIds: skillIds,
    dishIds,
  };
}

function findQualifiedReplacements(
  profile: Profile,
  remainingAvailable: ReadonlySet<string>,
  responsibilities: UnavailableEmployeeResponsibilities,
  stationCheck: StationCapacityCheck | null,
): QualifiedReplacement[] {
  if (!responsibilities.stationId || stationCheck?.status !== "satisfied") return [];
  const responsibilityDishes = profile.menu.filter((dish) => responsibilities.dishIds.includes(dish.id));
  const responsibilitySkills = unique(responsibilityDishes.flatMap((dish) => confirmedValue(dish.requiredSkillIds) ?? []));

  return profile.staff.flatMap((employee) => {
    if (!remainingAvailable.has(employee.id)) return [];
    const skills = confirmedValue(employee.skillIds);
    if (skills === null) return [];
    const covered = responsibilitySkills.filter((skillId) => skills.includes(skillId));
    if (covered.length === 0) return [];
    const recoverable = responsibilityDishes.filter((dish) => {
      const required = confirmedValue(dish.requiredSkillIds);
      return required !== null && required.every((skillId) => skills.includes(skillId));
    }).map((dish) => dish.id);
    return [{
      employeeId: employee.id,
      employeeName: confirmedValue(employee.name) ?? employee.id,
      confirmedSkillIds: [...skills],
      responsibilitySkillIdsCovered: covered,
      potentiallyRecoverableDishIds: recoverable,
    }];
  }).sort((left, right) => left.employeeId.localeCompare(right.employeeId));
}

function compareArrangements(
  profile: Profile,
  remainingAvailable: ReadonlySet<string>,
  immediateAssignments: ReadonlyMap<string, string | null>,
  immediateCoverage: StaffingCoverage,
  targetStationId: string | null,
  candidates: QualifiedReplacement[],
): ArrangementEvaluation[] {
  const candidateIds = candidates.map((candidate) => candidate.employeeId);
  const subsets = targetStationId ? candidateSubsets(candidateIds) : [[]];

  return subsets.map((movedEmployeeIds, index) => {
    const assignments = new Map(immediateAssignments);
    for (const employeeId of movedEmployeeIds) assignments.set(employeeId, targetStationId);
    const coverage = calculateStaffingCoverage(profile, { availableEmployeeIds: remainingAvailable, assignments });
    const changes = movedEmployeeIds.map((employeeId) => ({
      employeeId,
      fromStationId: immediateAssignments.get(employeeId) ?? null,
      toStationId: targetStationId,
    })).filter((change) => change.fromStationId !== change.toStationId);
    return {
      id: `arrangement-${index + 1}`,
      assignments: assignmentRecord(assignments),
      assignmentChanges: changes,
      coverage,
      recoveredDishIds: coverage.feasibleDishIds.filter((id) => !immediateCoverage.feasibleDishIds.includes(id)),
      displacedDishIds: immediateCoverage.feasibleDishIds.filter((id) => !coverage.feasibleDishIds.includes(id)),
    };
  });
}

function candidateSubsets(candidateIds: string[]): string[][] {
  if (candidateIds.length > 10) return [[], ...candidateIds.map((id) => [id])];
  const subsets: string[][] = [];
  for (let mask = 0; mask < 2 ** candidateIds.length; mask += 1) {
    const selected: string[] = [];
    for (let index = 0; index < candidateIds.length; index += 1) {
      if (mask & (1 << index)) selected.push(candidateIds[index]);
    }
    subsets.push(selected);
  }
  return subsets;
}

function chooseBestArrangement(arrangements: ArrangementEvaluation[]): ArrangementEvaluation {
  if (arrangements.length === 0) throw new OperationalInputError("No staffing arrangement could be evaluated.");
  return [...arrangements].sort((left, right) =>
    right.coverage.feasibleMenuItemCount - left.coverage.feasibleMenuItemCount ||
    left.assignmentChanges.length - right.assignmentChanges.length ||
    left.id.localeCompare(right.id))[0];
}

function buildStaffingGaps(profile: Profile, results: MenuItemFeasibility[]): StaffingGap[] {
  const gaps = new Map<string, StaffingGap>();
  for (const result of results.filter((item) => item.status !== "feasible")) {
    for (const skillId of result.missingSkillIds) {
      addGap(gaps, `skill:${skillId}`, {
        kind: result.status === "uncertain" ? "information" : "skill",
        resourceId: skillId,
        dishIds: [result.dishId],
        reason: result.status === "uncertain"
          ? `Coverage for ${skillName(profile, skillId)} is uncertain because confirmed staff information is missing.`
          : `No available employee at a compatible station has confirmed ${skillName(profile, skillId)} skill.`,
      });
    }
    for (const equipmentId of result.blockedEquipmentIds) {
      addGap(gaps, `equipment:${equipmentId}`, {
        kind: "equipment",
        resourceId: equipmentId,
        dishIds: [result.dishId],
        reason: `${equipmentName(profile, equipmentId)} is unavailable or lacks confirmed capacity.`,
      });
    }
    for (const factId of result.unknownFactIds) {
      addGap(gaps, `information:${factId}`, {
        kind: "information",
        resourceId: factId,
        dishIds: [result.dishId],
        reason: "Confirmed information required for this dish is missing.",
      });
    }
  }
  return [...gaps.values()].map((gap) => ({ ...gap, dishIds: unique(gap.dishIds).sort() }));
}

function buildAffectedDishes(
  profile: Profile,
  before: MenuItemFeasibility[],
  immediate: MenuItemFeasibility[],
  recovery: MenuItemFeasibility[],
): AffectedDish[] {
  return profile.menu.flatMap((dish) => {
    const first = resultFor(before, dish);
    const second = resultFor(immediate, dish);
    const third = resultFor(recovery, dish);
    if (first.status === second.status && second.status === third.status) return [];
    return [{
      dishId: dish.id,
      dishName: confirmedValue(dish.name) ?? dish.id,
      beforeDisruption: first.status,
      immediatelyAfter: second.status,
      afterRecovery: third.status,
      reasons: unique([...second.reasons, ...third.reasons]),
    }];
  });
}

function buildTradeOffs(
  profile: Profile,
  responsibilities: UnavailableEmployeeResponsibilities,
  arrangement: ArrangementEvaluation,
  stationCheck: StationCapacityCheck | null,
): string[] {
  const tradeOffs: string[] = [];
  for (const change of arrangement.assignmentChanges) {
    const employee = profile.staff.find((item) => item.id === change.employeeId);
    const employeeName = employee ? confirmedValue(employee.name) ?? employee.id : change.employeeId;
    tradeOffs.push(
      `${employeeName} moves from ` +
      `${change.fromStationId ? equipmentName(profile, change.fromStationId) : "an unknown station"} to ` +
      `${change.toStationId ? equipmentName(profile, change.toStationId) : "no station"}; ` +
      `${arrangement.recoveredDishIds.length} dish(es) are recovered and ${arrangement.displacedDishIds.length} previously feasible dish(es) are displaced.`,
    );
  }
  if (arrangement.assignmentChanges.length === 0 && responsibilities.stationId) {
    tradeOffs.push("No reassignment improves confirmed menu coverage without creating an equal or larger confirmed loss elsewhere.");
  }
  if (stationCheck?.confirmedCapacity !== null && stationCheck?.confirmedCapacity !== undefined) {
    tradeOffs.push(
      `${equipmentName(profile, stationCheck.stationId)} has confirmed capacity for ${stationCheck.confirmedCapacity} simultaneous dish slot(s); this does not estimate throughput.`,
    );
  }
  if (arrangement.coverage.uncertainMenuItemCount > 0) {
    tradeOffs.push(`${arrangement.coverage.uncertainMenuItemCount} dish(es) remain uncertain because required facts are missing or unverified.`);
  }
  return tradeOffs;
}

function addGap(gaps: Map<string, StaffingGap>, key: string, gap: StaffingGap): void {
  const current = gaps.get(key);
  if (current) current.dishIds.push(...gap.dishIds);
  else gaps.set(key, gap);
}

function resultFor(results: MenuItemFeasibility[], dish: ProfileMenuItem): MenuItemFeasibility {
  const result = results.find((item) => item.dishId === dish.id);
  if (!result) throw new OperationalInputError(`Dish ${dish.id} was not evaluated.`);
  return result;
}

function assignmentRecord(assignments: ReadonlyMap<string, string | null>): Record<string, string | null> {
  return Object.fromEntries([...assignments.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function skillName(profile: Profile, skillId: string): string {
  const skill = profile.skills.find((item) => item.id === skillId);
  return skill ? confirmedValue(skill.name) ?? skillId : skillId;
}

function equipmentName(profile: Profile, equipmentId: string): string {
  const equipment = profile.equipment.find((item) => item.id === equipmentId);
  return equipment ? confirmedValue(equipment.name) ?? equipmentId : equipmentId;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
