import rawRestaurant from "./sample-restaurant.json";
import type { CrisisRequest } from "../types/api";
import type { Restaurant } from "../types/restaurant";

/** Normal service: all three chefs are available. */
export const sampleRestaurant: Restaurant = rawRestaurant;

/**
 * Crisis fixture: Maya is absent. Leo can move from fryer to grill, but then
 * Nina cannot independently cover battered fish. Steak loses its only skilled
 * chef outright. Coverage remains 4/5; actual simultaneous service is tighter.
 * Assignment and capacity metadata stay local, outside the v1 API payload.
 */
export const sampleCrisisRequest: CrisisRequest = {
  restaurant: {
    id: sampleRestaurant.id,
    name: sampleRestaurant.name,
    serviceMinutes: sampleRestaurant.serviceMinutes,
    expectedOrders: sampleRestaurant.expectedOrders,
  },
  staff: sampleRestaurant.staff.map((employee) => ({
    id: employee.id,
    name: employee.name,
    role: employee.role,
    skills: [...employee.skills],
    baselineAvailable: employee.baselineAvailable,
    available: employee.id === "staff-maya" ? false : employee.available,
  })),
  equipment: sampleRestaurant.equipment.map((station) => ({
    id: station.id,
    name: station.name,
    available: station.available,
  })),
  menu: sampleRestaurant.menu.map((dish) => ({
    ...dish,
    requiredSkills: [...dish.requiredSkills],
    requiredEquipmentIds: [...dish.requiredEquipmentIds],
  })),
  problemDescription:
    "Maya called in sick before dinner. We expect 75 orders over three hours. " +
    "Leo can cover the grill, but Nina cannot prepare battered fish alone. " +
    "How should we reassign staff and adjust the menu?",
};
