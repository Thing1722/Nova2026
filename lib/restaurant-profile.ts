import type {
  Conflict,
  Fact,
  FactStatus,
  Profile,
  Source,
} from "../types/api";

type RestaurantFacts = Profile["restaurant"];

export interface ProfileUpdate {
  restaurant?: Partial<RestaurantFacts>;
  staff?: Profile["staff"];
  skills?: Profile["skills"];
  equipment?: Profile["equipment"];
  menu?: Profile["menu"];
}

export interface MergeProfileOptions {
  /** Facts explicitly corrected by the owner. Corrections may replace or clear values. */
  correctionFactIds?: Iterable<string>;
}

export interface MergeProfileResult {
  profile: Profile;
  conflicts: Conflict[];
  changedFactIds: string[];
}

export type ValidationSeverity = "error" | "warning" | "missing" | "conflict";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  path: string;
  factId: string | null;
  message: string;
}

export interface ProfileValidationResult {
  /** Structural validity. Missing facts are allowed during onboarding. */
  valid: boolean;
  issues: ValidationIssue[];
  missingData: ValidationIssue[];
  conflicts: Conflict[];
}

const FACT_STATUSES = new Set<FactStatus>(["unknown", "confirmed", "unverified"]);

export function createUnknownFact<T>(id: string): Fact<T> {
  return { id, value: null, status: "unknown", sourceIds: [] };
}

export function mergeRestaurantProfile(
  current: Profile,
  update: ProfileUpdate,
  existingConflicts: Conflict[] = [],
  options: MergeProfileOptions = {},
): MergeProfileResult {
  const correctionFactIds = new Set(options.correctionFactIds ?? []);
  const conflicts = [...existingConflicts];
  const changedFactIds = new Set<string>();

  const mergeFact = <T>(accepted: Fact<T>, proposed: Fact<T>): Fact<T> => {
    const correction = correctionFactIds.has(accepted.id);

    if (correction) {
      removeConflictsForFact(conflicts, accepted.id);
      const corrected = normalizeCorrectedFact(accepted.id, proposed);
      if (!factsEqual(accepted, corrected)) changedFactIds.add(accepted.id);
      return corrected;
    }

    if (proposed.status === "unknown" || proposed.value === null) return accepted;

    if (accepted.status === "unknown" || accepted.value === null) {
      const replacement = { ...proposed, id: accepted.id, sourceIds: unique(proposed.sourceIds) };
      if (!factsEqual(accepted, replacement)) changedFactIds.add(accepted.id);
      return replacement;
    }

    if (Array.isArray(accepted.value) && Array.isArray(proposed.value)) {
      const value = unique([...accepted.value, ...proposed.value]) as T;
      const merged = {
        id: accepted.id,
        value,
        status: strongestStatus(accepted.status, proposed.status),
        sourceIds: unique([...accepted.sourceIds, ...proposed.sourceIds]),
      };
      if (!factsEqual(accepted, merged)) changedFactIds.add(accepted.id);
      return merged;
    }

    if (valuesEqual(accepted.value, proposed.value)) {
      const merged = {
        ...accepted,
        status: strongestStatus(accepted.status, proposed.status),
        sourceIds: unique([...accepted.sourceIds, ...proposed.sourceIds]),
      };
      if (!factsEqual(accepted, merged)) changedFactIds.add(accepted.id);
      return merged;
    }

    if (accepted.status === "unverified" && proposed.status === "confirmed") {
      const replacement = { ...proposed, id: accepted.id, sourceIds: unique(proposed.sourceIds) };
      removeConflictsForFact(conflicts, accepted.id);
      changedFactIds.add(accepted.id);
      return replacement;
    }

    upsertConflict(conflicts, accepted.id, proposed);
    return accepted;
  };

  const restaurant: RestaurantFacts = {
    name: update.restaurant?.name
      ? mergeFact(current.restaurant.name, update.restaurant.name)
      : current.restaurant.name,
    cuisine: update.restaurant?.cuisine
      ? mergeFact(current.restaurant.cuisine, update.restaurant.cuisine)
      : current.restaurant.cuisine,
    immediateGoal: update.restaurant?.immediateGoal
      ? mergeFact(current.restaurant.immediateGoal, update.restaurant.immediateGoal)
      : current.restaurant.immediateGoal,
    reportedStaffCount: update.restaurant?.reportedStaffCount
      ? mergeFact(current.restaurant.reportedStaffCount, update.restaurant.reportedStaffCount)
      : current.restaurant.reportedStaffCount,
  };

  return {
    profile: {
      restaurant,
      staff: mergeEntityCollection(current.staff, update.staff, mergeFact, changedFactIds),
      skills: mergeEntityCollection(current.skills, update.skills, mergeFact, changedFactIds),
      equipment: mergeEntityCollection(current.equipment, update.equipment, mergeFact, changedFactIds),
      menu: mergeEntityCollection(current.menu, update.menu, mergeFact, changedFactIds),
    },
    conflicts,
    changedFactIds: [...changedFactIds],
  };
}

/** Alias used by action handlers that describe an incoming profile patch as an update. */
export const mergeProfileUpdate = mergeRestaurantProfile;

export function validateRestaurantProfile(
  profile: Profile,
  sources: Source[] = [],
  conflicts: Conflict[] = [],
): ProfileValidationResult {
  const issues: ValidationIssue[] = [];
  const sourceIds = new Set<string>();
  const sourcesById = new Map<string, Source>();
  const factIds = new Set<string>();
  const knownFactIds = new Set<string>();

  for (const source of sources) {
    if (sourceIds.has(source.id)) {
      addIssue(issues, "DUPLICATE_SOURCE_ID", "error", "sources", null, `Duplicate source ID: ${source.id}.`);
    }
    sourceIds.add(source.id);
    sourcesById.set(source.id, source);
    if (!source.id.trim() || !source.text.trim()) {
      addIssue(issues, "INVALID_SOURCE", "error", "sources", null, "Sources require nonempty IDs and evidence text.");
    }
  }

  const inspectFact = (fact: Fact<unknown>, path: string, capabilityInference = false): void => {
    if (!fact.id.trim()) {
      addIssue(issues, "MISSING_FACT_ID", "error", path, fact.id || null, "Every fact requires a stable nonempty ID.");
    } else if (factIds.has(fact.id)) {
      addIssue(issues, "DUPLICATE_FACT_ID", "error", path, fact.id, `Fact ID ${fact.id} is not unique.`);
    }
    factIds.add(fact.id);
    knownFactIds.add(fact.id);

    if (!FACT_STATUSES.has(fact.status)) {
      addIssue(issues, "INVALID_FACT_STATUS", "error", path, fact.id, `Unsupported fact status at ${path}.`);
      return;
    }
    if (fact.status === "unknown") {
      if (fact.value !== null) {
        addIssue(issues, "UNKNOWN_WITH_VALUE", "error", path, fact.id, "Unknown facts must have a null value.");
      } else {
        addIssue(issues, "MISSING_DATA", "missing", path, fact.id, `${humanizePath(path)} is not known yet.`);
      }
    } else {
      if (fact.value === null) {
        addIssue(issues, "KNOWN_WITHOUT_VALUE", "error", path, fact.id, `${fact.status} facts require a value.`);
      }
      if (fact.sourceIds.length === 0) {
        addIssue(issues, "MISSING_EVIDENCE", "error", path, fact.id, `${fact.status} facts require evidence.`);
      }
    }
    if (capabilityInference && fact.status === "unverified") {
      addIssue(
        issues,
        "FORBIDDEN_CAPABILITY_INFERENCE",
        "error",
        path,
        fact.id,
        "Skills, availability, assignments, capacity, and dish requirements cannot be AI-inferred.",
      );
    }
    if (typeof fact.value === "string" && !fact.value.trim()) {
      addIssue(issues, "EMPTY_TEXT_VALUE", "error", path, fact.id, "Text fact values must be nonempty.");
    }
    if (Array.isArray(fact.value) && unique(fact.value).length !== fact.value.length) {
      addIssue(issues, "DUPLICATE_LIST_VALUE", "error", path, fact.id, "Fact lists cannot contain duplicate IDs.");
    }
    for (const sourceId of fact.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        addIssue(issues, "UNKNOWN_SOURCE_ID", "error", path, fact.id, `Evidence source ${sourceId} does not exist.`);
      }
    }
    const evidence = fact.sourceIds.flatMap((sourceId) => {
      const source = sourcesById.get(sourceId);
      return source ? [source] : [];
    });
    if (fact.status === "confirmed" && evidence.length > 0 &&
      !evidence.some((source) => ["owner_message", "owner_edit", "owner_confirmation"].includes(source.kind))) {
      addIssue(issues, "INVALID_CONFIRMED_EVIDENCE", "error", path, fact.id, "Confirmed facts require owner evidence.");
    }
    if (fact.status === "unverified" && evidence.some((source) => !["ai_inference", "menu_upload"].includes(source.kind))) {
      addIssue(issues, "INVALID_UNVERIFIED_EVIDENCE", "error", path, fact.id, "Unverified facts require inference or upload evidence.");
    }
  };

  inspectFact(profile.restaurant.name, "restaurant.name");
  inspectFact(profile.restaurant.cuisine, "restaurant.cuisine");
  inspectFact(profile.restaurant.immediateGoal, "restaurant.immediateGoal");
  inspectFact(profile.restaurant.reportedStaffCount, "restaurant.reportedStaffCount");
  inspectNonnegativeInteger(profile.restaurant.reportedStaffCount, "restaurant.reportedStaffCount", issues);

  inspectUniqueEntities(profile.staff, "staff", issues);
  inspectUniqueEntities(profile.skills, "skills", issues);
  inspectUniqueEntities(profile.equipment, "equipment", issues);
  inspectUniqueEntities(profile.menu, "menu", issues);

  for (const [index, member] of profile.staff.entries()) {
    const base = `staff[${index}]`;
    inspectFact(member.name, `${base}.name`);
    inspectFact(member.role, `${base}.role`);
    inspectFact(member.available, `${base}.available`, true);
    inspectFact(member.skillIds, `${base}.skillIds`, true);
    inspectFact(member.assignedStationId, `${base}.assignedStationId`, true);
  }
  for (const [index, skill] of profile.skills.entries()) inspectFact(skill.name, `skills[${index}].name`);
  for (const [index, equipment] of profile.equipment.entries()) {
    const base = `equipment[${index}]`;
    inspectFact(equipment.name, `${base}.name`);
    inspectFact(equipment.quantity, `${base}.quantity`);
    inspectFact(equipment.available, `${base}.available`, true);
    inspectFact(equipment.capacity, `${base}.capacity`, true);
    inspectFact(equipment.capacityNotes, `${base}.capacityNotes`);
    inspectNonnegativeInteger(equipment.quantity, `${base}.quantity`, issues);
    inspectNonnegativeInteger(equipment.capacity, `${base}.capacity`, issues);
  }
  for (const [index, dish] of profile.menu.entries()) {
    const base = `menu[${index}]`;
    inspectFact(dish.name, `${base}.name`);
    inspectFact(dish.requiredSkillIds, `${base}.requiredSkillIds`, true);
    inspectFact(dish.requiredEquipmentIds, `${base}.requiredEquipmentIds`, true);
  }

  validateReferences(profile, issues);
  validateReportedStaffCount(profile, issues);
  validateDuplicateNames(profile, issues);

  const conflictIds = new Set<string>();
  for (const conflict of conflicts) {
    if (conflictIds.has(conflict.id)) {
      addIssue(issues, "DUPLICATE_CONFLICT_ID", "error", "conflicts", conflict.factId, `Duplicate conflict ID: ${conflict.id}.`);
    }
    conflictIds.add(conflict.id);
    if (!knownFactIds.has(conflict.factId)) {
      addIssue(issues, "UNKNOWN_CONFLICT_FACT", "error", "conflicts", conflict.factId, `Conflict references unknown fact ${conflict.factId}.`);
    }
    for (const sourceId of conflict.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        addIssue(issues, "UNKNOWN_SOURCE_ID", "error", "conflicts", conflict.factId, `Conflict source ${sourceId} does not exist.`);
      }
    }
    addIssue(issues, "UNRESOLVED_CONFLICT", "conflict", "conflicts", conflict.factId, conflict.explanation);
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    missingData: issues.filter((issue) => issue.severity === "missing"),
    conflicts: [...conflicts],
  };
}

function mergeEntityFacts<T extends { id: string }>(
  accepted: T,
  proposed: T,
  mergeFact: <V>(current: Fact<V>, incoming: Fact<V>) => Fact<V>,
): T {
  const result: Record<string, unknown> = { ...accepted };
  for (const key of Object.keys(accepted)) {
    if (key === "id") continue;
    const currentValue = (accepted as unknown as Record<string, unknown>)[key];
    const proposedValue = (proposed as unknown as Record<string, unknown>)[key];
    if (isFact(currentValue) && isFact(proposedValue)) result[key] = mergeFact(currentValue, proposedValue);
  }
  return result as unknown as T;
}

function mergeEntityCollection<T extends { id: string }>(
  current: T[],
  incoming: T[] | undefined,
  mergeFact: <V>(accepted: Fact<V>, proposed: Fact<V>) => Fact<V>,
  changedFactIds: Set<string>,
): T[] {
  if (!incoming) return current;
  const result = current.map((entity) => {
    const proposed = incoming.find((candidate) => candidate.id === entity.id);
    return proposed ? mergeEntityFacts(entity, proposed, mergeFact) : entity;
  });
  for (const entity of incoming) {
    if (current.some((candidate) => candidate.id === entity.id)) continue;
    result.push(entity);
    for (const value of Object.values(entity)) {
      if (isFact(value)) changedFactIds.add(value.id);
    }
  }
  return result;
}

function isFact(value: unknown): value is Fact<unknown> {
  return Boolean(value && typeof value === "object" && "status" in value && "sourceIds" in value && "value" in value);
}

function normalizeCorrectedFact<T>(id: string, fact: Fact<T>): Fact<T> {
  if (fact.value === null) return { id, value: null, status: "unknown", sourceIds: unique(fact.sourceIds) };
  return { id, value: fact.value, status: "confirmed", sourceIds: unique(fact.sourceIds) };
}

function upsertConflict<T>(conflicts: Conflict[], factId: string, proposed: Fact<T>): void {
  if (proposed.value === null) return;
  const id = `conflict:${factId}:${proposed.sourceIds.at(-1) ?? "update"}`;
  const conflict: Conflict = {
    id,
    factId,
    proposedValue: proposed.value as unknown as string | number | boolean | string[],
    sourceIds: unique(proposed.sourceIds),
    explanation: `New evidence proposes a different value for fact ${factId}; the accepted value was preserved pending owner clarification.`,
  };
  const index = conflicts.findIndex((candidate) => candidate.id === id);
  if (index >= 0) conflicts[index] = conflict;
  else conflicts.push(conflict);
}

function removeConflictsForFact(conflicts: Conflict[], factId: string): void {
  for (let index = conflicts.length - 1; index >= 0; index -= 1) {
    if (conflicts[index].factId === factId) conflicts.splice(index, 1);
  }
}

function strongestStatus(left: FactStatus, right: FactStatus): FactStatus {
  if (left === "confirmed" || right === "confirmed") return "confirmed";
  if (left === "unverified" || right === "unverified") return "unverified";
  return "unknown";
}

function factsEqual(left: Fact<unknown>, right: Fact<unknown>): boolean {
  return left.status === right.status && valuesEqual(left.value, right.value) && valuesEqual(left.sourceIds, right.sourceIds);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function inspectUniqueEntities(
  entities: Array<{ id: string }>,
  path: string,
  issues: ValidationIssue[],
): void {
  const ids = new Set<string>();
  for (const entity of entities) {
    if (!entity.id.trim()) addIssue(issues, "MISSING_ENTITY_ID", "error", path, null, `${path} entries require stable IDs.`);
    if (ids.has(entity.id)) addIssue(issues, "DUPLICATE_ENTITY_ID", "error", path, null, `Duplicate ${path} ID: ${entity.id}.`);
    ids.add(entity.id);
  }
}

function inspectNonnegativeInteger(fact: Fact<number>, path: string, issues: ValidationIssue[]): void {
  if (fact.value !== null && (!Number.isInteger(fact.value) || fact.value < 0)) {
    addIssue(issues, "INVALID_NONNEGATIVE_INTEGER", "error", path, fact.id, `${humanizePath(path)} must be a nonnegative integer.`);
  }
}

function validateReferences(profile: Profile, issues: ValidationIssue[]): void {
  const skillIds = new Set(profile.skills.map((skill) => skill.id));
  const equipmentIds = new Set(profile.equipment.map((equipment) => equipment.id));

  for (const [index, member] of profile.staff.entries()) {
    for (const id of member.skillIds.value ?? []) {
      if (!skillIds.has(id)) addIssue(issues, "UNKNOWN_SKILL_REFERENCE", "error", `staff[${index}].skillIds`, member.skillIds.id, `Unknown skill reference: ${id}.`);
    }
    const stationId = member.assignedStationId.value;
    if (stationId !== null && !equipmentIds.has(stationId)) {
      addIssue(issues, "UNKNOWN_STATION_REFERENCE", "error", `staff[${index}].assignedStationId`, member.assignedStationId.id, `Unknown station reference: ${stationId}.`);
    }
  }
  for (const [index, dish] of profile.menu.entries()) {
    for (const id of dish.requiredSkillIds.value ?? []) {
      if (!skillIds.has(id)) addIssue(issues, "UNKNOWN_SKILL_REFERENCE", "error", `menu[${index}].requiredSkillIds`, dish.requiredSkillIds.id, `Unknown skill reference: ${id}.`);
    }
    for (const id of dish.requiredEquipmentIds.value ?? []) {
      if (!equipmentIds.has(id)) addIssue(issues, "UNKNOWN_EQUIPMENT_REFERENCE", "error", `menu[${index}].requiredEquipmentIds`, dish.requiredEquipmentIds.id, `Unknown equipment reference: ${id}.`);
    }
  }
}

function validateReportedStaffCount(profile: Profile, issues: ValidationIssue[]): void {
  const count = profile.restaurant.reportedStaffCount.value;
  if (count === null) return;
  if (profile.staff.length > count) {
    addIssue(issues, "STAFF_COUNT_CONFLICT", "conflict", "restaurant.reportedStaffCount", profile.restaurant.reportedStaffCount.id, `Reported staff count is ${count}, but ${profile.staff.length} staff records exist.`);
  } else if (profile.staff.length < count) {
    addIssue(issues, "UNIDENTIFIED_STAFF", "missing", "staff", profile.restaurant.reportedStaffCount.id, `${count - profile.staff.length} reported staff member(s) do not yet have individual profiles.`);
  }
}

function validateDuplicateNames(profile: Profile, issues: ValidationIssue[]): void {
  for (const [collection, entities] of [
    ["staff", profile.staff],
    ["skills", profile.skills],
    ["equipment", profile.equipment],
    ["menu", profile.menu],
  ] as const) {
    const names = new Map<string, string>();
    for (const entity of entities) {
      const value = entity.name.value?.trim().toLocaleLowerCase();
      if (!value) continue;
      const prior = names.get(value);
      if (prior) addIssue(issues, "POSSIBLE_DUPLICATE_ENTITY", "warning", collection, entity.name.id, `${collection} entries ${prior} and ${entity.id} share the same name.`);
      else names.set(value, entity.id);
    }
  }
}

function addIssue(
  issues: ValidationIssue[],
  code: string,
  severity: ValidationSeverity,
  path: string,
  factId: string | null,
  message: string,
): void {
  issues.push({ code, severity, path, factId, message });
}

function humanizePath(path: string): string {
  return path.replaceAll(/\[(\d+)\]/g, " $1").replaceAll(".", " ");
}
