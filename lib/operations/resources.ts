import type {
  Fact,
  Profile,
  ProfileEquipment,
  ProfileMenuItem,
  ProfileStaffMember,
} from "../../types/api";

export type ResourceCheckStatus = "satisfied" | "blocked" | "unknown";

export interface ResourceCheck {
  status: ResourceCheckStatus;
  reasons: string[];
  missingFactIds: string[];
}

export interface StationCapacityCheck extends ResourceCheck {
  stationId: string;
  confirmedCapacity: number | null;
  requestedConcurrentDishes: number;
}

export interface MenuFeasibilityContext {
  availableEmployeeIds: ReadonlySet<string>;
  /** One station per employee. null means the assignment is unknown or absent. */
  assignments: ReadonlyMap<string, string | null>;
  requiredConcurrentDishes?: number;
}

export type MenuFeasibilityStatus = "feasible" | "infeasible" | "uncertain";

export interface MenuItemFeasibility {
  dishId: string;
  status: MenuFeasibilityStatus;
  coveringEmployeeIds: string[];
  missingSkillIds: string[];
  blockedEquipmentIds: string[];
  unknownFactIds: string[];
  reasons: string[];
}

export interface MissingOperationalInformation {
  path: string;
  factId: string;
  reason: string;
}

export interface StaffingCoverage {
  availableStaffCount: number;
  feasibleMenuItemCount: number;
  uncertainMenuItemCount: number;
  menuCoveragePercent: number;
  feasibleDishIds: string[];
  infeasibleDishIds: string[];
  uncertainDishIds: string[];
  dishResults: MenuItemFeasibility[];
}

export function confirmedValue<T>(fact: Fact<T>): T | null {
  return fact.status === "confirmed" && fact.value !== null ? fact.value : null;
}

export function employeeSkillMatch(
  employee: ProfileStaffMember,
  requiredSkillIds: readonly string[],
): ResourceCheck {
  const confirmedSkills = confirmedValue(employee.skillIds);
  if (confirmedSkills === null) {
    return {
      status: "unknown",
      reasons: ["Employee skills are missing or unverified."],
      missingFactIds: [employee.skillIds.id],
    };
  }
  const missing = requiredSkillIds.filter((skillId) => !confirmedSkills.includes(skillId));
  return missing.length === 0
    ? { status: "satisfied", reasons: [], missingFactIds: [] }
    : {
        status: "blocked",
        reasons: [`Employee lacks confirmed skills: ${missing.join(", ")}.`],
        missingFactIds: [],
      };
}

export function checkStationCapacity(
  station: ProfileEquipment,
  requestedConcurrentDishes = 1,
): StationCapacityCheck {
  const missingFactIds: string[] = [];
  const reasons: string[] = [];
  const available = confirmedValue(station.available);
  const quantity = confirmedValue(station.quantity);
  const capacity = confirmedValue(station.capacity);

  if (available === null) missingFactIds.push(station.available.id);
  else if (!available) reasons.push("Station is confirmed unavailable.");
  if (quantity === null) missingFactIds.push(station.quantity.id);
  else if (quantity < 1) reasons.push("Station quantity is zero.");
  if (capacity === null) missingFactIds.push(station.capacity.id);
  else if (capacity < requestedConcurrentDishes) {
    reasons.push(`Confirmed capacity ${capacity} is below the required ${requestedConcurrentDishes} simultaneous dish slot(s).`);
  }

  const blocked = reasons.length > 0;
  return {
    stationId: station.id,
    status: blocked ? "blocked" : missingFactIds.length > 0 ? "unknown" : "satisfied",
    confirmedCapacity: capacity,
    requestedConcurrentDishes,
    reasons,
    missingFactIds,
  };
}

export function equipmentCompatibility(
  profile: Profile,
  requiredEquipmentIds: readonly string[],
  requestedConcurrentDishes = 1,
): ResourceCheck {
  const reasons: string[] = [];
  const missingFactIds: string[] = [];
  let blocked = false;

  for (const equipmentId of requiredEquipmentIds) {
    const station = profile.equipment.find((item) => item.id === equipmentId);
    if (!station) {
      blocked = true;
      reasons.push(`Required equipment ${equipmentId} does not exist in the profile.`);
      continue;
    }
    const check = checkStationCapacity(station, requestedConcurrentDishes);
    if (check.status === "blocked") blocked = true;
    reasons.push(...check.reasons);
    missingFactIds.push(...check.missingFactIds);
  }

  return {
    status: blocked ? "blocked" : missingFactIds.length > 0 ? "unknown" : "satisfied",
    reasons: unique(reasons),
    missingFactIds: unique(missingFactIds),
  };
}

export function evaluateMenuItemFeasibility(
  profile: Profile,
  dish: ProfileMenuItem,
  context: MenuFeasibilityContext,
): MenuItemFeasibility {
  const reasons: string[] = [];
  const unknownFactIds: string[] = [];
  const coveringEmployeeIds = new Set<string>();
  const missingSkillIds: string[] = [];
  const blockedEquipmentIds: string[] = [];
  const definitelyMissingSkillIds = new Set<string>();

  const requiredSkillIds = confirmedValue(dish.requiredSkillIds);
  const requiredEquipmentIds = confirmedValue(dish.requiredEquipmentIds);
  if (requiredSkillIds === null) {
    unknownFactIds.push(dish.requiredSkillIds.id);
    reasons.push("Dish skill requirements are missing or unverified.");
  }
  if (requiredEquipmentIds === null) {
    unknownFactIds.push(dish.requiredEquipmentIds.id);
    reasons.push("Dish equipment requirements are missing or unverified.");
  }

  if (requiredEquipmentIds !== null) {
    const equipmentCheck = equipmentCompatibility(
      profile,
      requiredEquipmentIds,
      context.requiredConcurrentDishes ?? 1,
    );
    unknownFactIds.push(...equipmentCheck.missingFactIds);
    reasons.push(...equipmentCheck.reasons);
    if (equipmentCheck.status === "blocked") {
      for (const id of requiredEquipmentIds) {
        const station = profile.equipment.find((item) => item.id === id);
        if (!station || checkStationCapacity(station, context.requiredConcurrentDishes ?? 1).status === "blocked") {
          blockedEquipmentIds.push(id);
        }
      }
    }
  }

  if (requiredSkillIds !== null && requiredEquipmentIds !== null) {
    for (const skillId of requiredSkillIds) {
      const capableEmployees: ProfileStaffMember[] = [];
      const potentialUnknownFactIds: string[] = [];
      for (const employee of profile.staff) {
        if (!context.availableEmployeeIds.has(employee.id)) {
          if (confirmedValue(employee.available) !== null) continue;
          let unknownAssignmentFactId: string | null = null;
          if (requiredEquipmentIds.length > 0) {
            const possibleAssignment = confirmedValue(employee.assignedStationId);
            if (possibleAssignment !== null && !requiredEquipmentIds.includes(possibleAssignment)) continue;
            if (possibleAssignment === null) unknownAssignmentFactId = employee.assignedStationId.id;
          }
          const possibleSkills = confirmedValue(employee.skillIds);
          if (possibleSkills === null) {
            potentialUnknownFactIds.push(employee.available.id, employee.skillIds.id);
            if (unknownAssignmentFactId) potentialUnknownFactIds.push(unknownAssignmentFactId);
            continue;
          }
          if (!possibleSkills.includes(skillId)) continue;
          potentialUnknownFactIds.push(employee.available.id);
          if (unknownAssignmentFactId) potentialUnknownFactIds.push(unknownAssignmentFactId);
          continue;
        }
        const skills = confirmedValue(employee.skillIds);
        if (skills === null) {
          potentialUnknownFactIds.push(employee.skillIds.id);
          continue;
        }
        if (!skills.includes(skillId)) continue;
        if (requiredEquipmentIds.length === 0) {
          capableEmployees.push(employee);
          continue;
        }
        const assignment = context.assignments.get(employee.id) ?? null;
        if (assignment === null) {
          potentialUnknownFactIds.push(employee.assignedStationId.id);
          continue;
        }
        if (requiredEquipmentIds.includes(assignment)) capableEmployees.push(employee);
      }
      if (capableEmployees.length === 0) {
        missingSkillIds.push(skillId);
        unknownFactIds.push(...potentialUnknownFactIds);
        if (potentialUnknownFactIds.length === 0) {
          definitelyMissingSkillIds.add(skillId);
          reasons.push(`No available, correctly assigned employee has confirmed skill ${skillId}.`);
        } else {
          reasons.push(`Coverage for skill ${skillId} is uncertain because staff information is missing or unverified.`);
        }
      } else {
        for (const employee of capableEmployees) coveringEmployeeIds.add(employee.id);
      }
    }
  }

  const definiteBlock = blockedEquipmentIds.length > 0 || definitelyMissingSkillIds.size > 0;
  const status: MenuFeasibilityStatus = definiteBlock
    ? "infeasible"
    : unknownFactIds.length > 0
      ? "uncertain"
      : "feasible";

  return {
    dishId: dish.id,
    status,
    coveringEmployeeIds: [...coveringEmployeeIds].sort(),
    missingSkillIds: unique(missingSkillIds),
    blockedEquipmentIds: unique(blockedEquipmentIds),
    unknownFactIds: unique(unknownFactIds),
    reasons: unique(reasons),
  };
}

export function calculateStaffingCoverage(
  profile: Profile,
  context: MenuFeasibilityContext,
): StaffingCoverage {
  const dishResults = profile.menu.map((dish) => evaluateMenuItemFeasibility(profile, dish, context));
  const feasibleDishIds = dishResults.filter((result) => result.status === "feasible").map((result) => result.dishId);
  const infeasibleDishIds = dishResults.filter((result) => result.status === "infeasible").map((result) => result.dishId);
  const uncertainDishIds = dishResults.filter((result) => result.status === "uncertain").map((result) => result.dishId);
  return {
    availableStaffCount: context.availableEmployeeIds.size,
    feasibleMenuItemCount: feasibleDishIds.length,
    uncertainMenuItemCount: uncertainDishIds.length,
    menuCoveragePercent: profile.menu.length === 0 ? 0 : roundOneDecimal(100 * feasibleDishIds.length / profile.menu.length),
    feasibleDishIds,
    infeasibleDishIds,
    uncertainDishIds,
    dishResults,
  };
}

export function detectMissingOperationalInformation(profile: Profile): MissingOperationalInformation[] {
  const missing: MissingOperationalInformation[] = [];
  for (const employee of profile.staff) {
    inspect(employee.available, `staff.${employee.id}.available`, "Employee availability", missing);
    inspect(employee.skillIds, `staff.${employee.id}.skillIds`, "Employee skills", missing);
    inspect(employee.assignedStationId, `staff.${employee.id}.assignedStationId`, "Employee station assignment", missing);
  }
  for (const station of profile.equipment) {
    inspect(station.quantity, `equipment.${station.id}.quantity`, "Equipment quantity", missing);
    inspect(station.available, `equipment.${station.id}.available`, "Equipment availability", missing);
    inspect(station.capacity, `equipment.${station.id}.capacity`, "Equipment capacity", missing);
  }
  for (const dish of profile.menu) {
    inspect(dish.requiredSkillIds, `menu.${dish.id}.requiredSkillIds`, "Dish skill requirements", missing);
    inspect(dish.requiredEquipmentIds, `menu.${dish.id}.requiredEquipmentIds`, "Dish equipment requirements", missing);
  }
  return missing;
}

export function confirmedAvailableEmployeeIds(profile: Profile): Set<string> {
  return new Set(profile.staff.filter((employee) => confirmedValue(employee.available) === true).map((employee) => employee.id));
}

export function confirmedAssignments(profile: Profile, employeeIds: ReadonlySet<string>): Map<string, string | null> {
  const assignments = new Map<string, string | null>();
  for (const employee of profile.staff) {
    if (employeeIds.has(employee.id)) assignments.set(employee.id, confirmedValue(employee.assignedStationId));
  }
  return assignments;
}

function inspect(
  fact: Fact<unknown>,
  path: string,
  label: string,
  missing: MissingOperationalInformation[],
): void {
  if (fact.status !== "confirmed" || fact.value === null) {
    missing.push({
      path,
      factId: fact.id,
      reason: `${label} is ${fact.status === "unverified" ? "unverified" : "missing"}.`,
    });
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function roundOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
