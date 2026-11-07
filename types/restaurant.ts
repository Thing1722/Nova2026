import type { Equipment, MenuItem, RestaurantInfo, StaffMember } from "./api";

/** Local dataset metadata. Strip assignedStationId from API staff entries. */
export interface Employee extends StaffMember {
  /** References KitchenStation.id; null means unassigned. */
  assignedStationId: string | null;
}

/** A station is represented as equipment in the API contract. */
export interface KitchenStation extends Equipment {
  /** Maximum dishes that can occupy this station simultaneously, not orders/hour. */
  capacity: number;
}

/** Local restaurant aggregate; API requests nest only RestaurantInfo in restaurant. */
export interface Restaurant extends RestaurantInfo {
  staff: Employee[];
  equipment: KitchenStation[];
  menu: MenuItem[];
}
