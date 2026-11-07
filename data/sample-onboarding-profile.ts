import type { Fact, Profile, Source } from "../types/api";

const RESTAURANT_SOURCE = "source-owner-restaurant";
const STAFF_SOURCE = "source-owner-staff";
const OPERATIONS_SOURCE = "source-owner-operations";

const confirmed = <T>(id: string, value: T, sourceId: string): Fact<T> => ({
  id,
  value,
  status: "confirmed",
  sourceIds: [sourceId],
});

const unknown = <T>(id: string): Fact<T> => ({
  id,
  value: null,
  status: "unknown",
  sourceIds: [],
});

export const sampleOnboardingSources: Source[] = [
  {
    id: RESTAURANT_SOURCE,
    kind: "owner_message",
    text: "Maple Street Grill is a neighborhood American grill with three chefs.",
    fileName: null,
    location: null,
  },
  {
    id: STAFF_SOURCE,
    kind: "owner_message",
    text: "Maya is our head chef and handles grill and steak. Leo is a line cook who fries, batters, and can cover grill. Nina is a junior chef who fries. Maya uses the grill station; Leo and Nina use the fryer. All three are available.",
    fileName: null,
    location: null,
  },
  {
    id: OPERATIONS_SOURCE,
    kind: "owner_edit",
    text: "The grill holds four dishes and the fryer holds two. Here are our five current dishes and their requirements.",
    fileName: null,
    location: null,
  },
];

/**
 * Complete offline fixture for UI and backend development. Capacity means
 * simultaneous dishes, not throughput. It is not owner data for production.
 */
export const sampleOnboardingProfile: Profile = {
  restaurant: {
    name: confirmed("fact-restaurant-name", "Maple Street Grill", RESTAURANT_SOURCE),
    cuisine: confirmed("fact-restaurant-cuisine", "American grill", RESTAURANT_SOURCE),
    immediateGoal: unknown("fact-restaurant-goal"),
    reportedStaffCount: confirmed("fact-restaurant-staff-count", 3, RESTAURANT_SOURCE),
  },
  skills: [
    { id: "skill-grill", name: confirmed("fact-skill-grill-name", "Grill cooking", STAFF_SOURCE) },
    { id: "skill-steak", name: confirmed("fact-skill-steak-name", "Steak preparation", STAFF_SOURCE) },
    { id: "skill-fry", name: confirmed("fact-skill-fry-name", "Frying", STAFF_SOURCE) },
    { id: "skill-batter", name: confirmed("fact-skill-batter-name", "Battering", STAFF_SOURCE) },
  ],
  staff: [
    {
      id: "staff-maya",
      name: confirmed("fact-staff-maya-name", "Maya Chen", STAFF_SOURCE),
      role: confirmed("fact-staff-maya-role", "Head chef", STAFF_SOURCE),
      available: confirmed("fact-staff-maya-available", true, STAFF_SOURCE),
      skillIds: confirmed("fact-staff-maya-skills", ["skill-grill", "skill-steak"], STAFF_SOURCE),
      assignedStationId: confirmed("fact-staff-maya-station", "equipment-grill", STAFF_SOURCE),
    },
    {
      id: "staff-leo",
      name: confirmed("fact-staff-leo-name", "Leo Rivera", STAFF_SOURCE),
      role: confirmed("fact-staff-leo-role", "Line cook", STAFF_SOURCE),
      available: confirmed("fact-staff-leo-available", true, STAFF_SOURCE),
      skillIds: confirmed("fact-staff-leo-skills", ["skill-fry", "skill-batter", "skill-grill"], STAFF_SOURCE),
      assignedStationId: confirmed("fact-staff-leo-station", "equipment-fryer", STAFF_SOURCE),
    },
    {
      id: "staff-nina",
      name: confirmed("fact-staff-nina-name", "Nina Patel", STAFF_SOURCE),
      role: confirmed("fact-staff-nina-role", "Junior chef", STAFF_SOURCE),
      available: confirmed("fact-staff-nina-available", true, STAFF_SOURCE),
      skillIds: confirmed("fact-staff-nina-skills", ["skill-fry"], STAFF_SOURCE),
      assignedStationId: confirmed("fact-staff-nina-station", "equipment-fryer", STAFF_SOURCE),
    },
  ],
  equipment: [
    {
      id: "equipment-grill",
      name: confirmed("fact-equipment-grill-name", "Grill station", OPERATIONS_SOURCE),
      quantity: confirmed("fact-equipment-grill-quantity", 1, OPERATIONS_SOURCE),
      available: confirmed("fact-equipment-grill-available", true, OPERATIONS_SOURCE),
      capacity: confirmed("fact-equipment-grill-capacity", 4, OPERATIONS_SOURCE),
      capacityNotes: confirmed("fact-equipment-grill-notes", "Four dishes at once", OPERATIONS_SOURCE),
    },
    {
      id: "equipment-fryer",
      name: confirmed("fact-equipment-fryer-name", "Fryer station", OPERATIONS_SOURCE),
      quantity: confirmed("fact-equipment-fryer-quantity", 1, OPERATIONS_SOURCE),
      available: confirmed("fact-equipment-fryer-available", true, OPERATIONS_SOURCE),
      capacity: confirmed("fact-equipment-fryer-capacity", 2, OPERATIONS_SOURCE),
      capacityNotes: confirmed("fact-equipment-fryer-notes", "Two baskets at once", OPERATIONS_SOURCE),
    },
  ],
  menu: [
    {
      id: "dish-steak",
      name: confirmed("fact-dish-steak-name", "Grilled Ribeye", OPERATIONS_SOURCE),
      requiredSkillIds: confirmed("fact-dish-steak-skills", ["skill-grill", "skill-steak"], OPERATIONS_SOURCE),
      requiredEquipmentIds: confirmed("fact-dish-steak-equipment", ["equipment-grill"], OPERATIONS_SOURCE),
    },
    {
      id: "dish-burger",
      name: confirmed("fact-dish-burger-name", "House Beef Burger", OPERATIONS_SOURCE),
      requiredSkillIds: confirmed("fact-dish-burger-skills", ["skill-grill"], OPERATIONS_SOURCE),
      requiredEquipmentIds: confirmed("fact-dish-burger-equipment", ["equipment-grill"], OPERATIONS_SOURCE),
    },
    {
      id: "dish-vegetables",
      name: confirmed("fact-dish-vegetables-name", "Grilled Vegetable Plate", OPERATIONS_SOURCE),
      requiredSkillIds: confirmed("fact-dish-vegetables-skills", ["skill-grill"], OPERATIONS_SOURCE),
      requiredEquipmentIds: confirmed("fact-dish-vegetables-equipment", ["equipment-grill"], OPERATIONS_SOURCE),
    },
    {
      id: "dish-fish-chips",
      name: confirmed("fact-dish-fish-name", "Beer-Battered Fish and Chips", OPERATIONS_SOURCE),
      requiredSkillIds: confirmed("fact-dish-fish-skills", ["skill-fry", "skill-batter"], OPERATIONS_SOURCE),
      requiredEquipmentIds: confirmed("fact-dish-fish-equipment", ["equipment-fryer"], OPERATIONS_SOURCE),
    },
    {
      id: "dish-fries",
      name: confirmed("fact-dish-fries-name", "Seasoned Fries", OPERATIONS_SOURCE),
      requiredSkillIds: confirmed("fact-dish-fries-skills", ["skill-fry"], OPERATIONS_SOURCE),
      requiredEquipmentIds: confirmed("fact-dish-fries-equipment", ["equipment-fryer"], OPERATIONS_SOURCE),
    },
  ],
};
