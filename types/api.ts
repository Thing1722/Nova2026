/** POST /api/analyze v1 wire models. Do not add local UI metadata here. */
export interface RestaurantInfo {
  id: string;
  name: string;
  serviceMinutes: number;
  expectedOrders: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  skills: string[];
  baselineAvailable: boolean;
  available: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  available: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  requiredSkills: string[];
  requiredEquipmentIds: string[];
}

export interface CrisisRequest {
  restaurant: RestaurantInfo;
  staff: StaffMember[];
  equipment: Equipment[];
  menu: MenuItem[];
  problemDescription: string;
}

export interface StaffingChange {
  staffId: string;
  recommendedAssignment: string;
  reason: string;
}

export interface AffectedMenuItem {
  dishId: string;
  impact: "unavailable" | "limited";
  reason: string;
}

export interface MenuAdjustment {
  dishId: string;
  action: "pause" | "limit" | "keep";
  suggestion: string;
}

export interface OperationalRisk {
  severity: "low" | "medium" | "high";
  description: string;
  mitigation: string;
}

/** Backend-calculated coverage, not a simultaneous capacity model. */
export interface CalculatedMetrics {
  availableStaffCount: number;
  feasibleMenuItemCount: number;
  menuCoveragePercent: number;
}

/** AI estimates only; not measured or guaranteed operating outcomes. */
export interface EstimatedMetrics {
  ordersPerHour: number;
  averageWaitMinutes: number;
}

export interface OperationalAnalysisResponse {
  summary: string;
  staffingChanges: StaffingChange[];
  affectedMenuItems: AffectedMenuItem[];
  menuAdjustments: MenuAdjustment[];
  operationalRisks: OperationalRisk[];
  metrics: {
    calculated: { before: CalculatedMetrics; after: CalculatedMetrics };
    aiEstimates: {
      before: EstimatedMetrics;
      after: EstimatedMetrics;
      rationale: string;
    };
  };
  assumptions: string[];
}

export interface AnalysisErrorResponse {
  error: {
    code: "INVALID_REQUEST" | "ANALYSIS_FAILED" | "INTERNAL_ERROR";
    message: string;
  };
}

/**
 * Phase 1 onboarding models. These are intentionally separate from the
 * complete-data /api/analyze models above.
 */
export type FactStatus = "unknown" | "confirmed" | "unverified";

export interface Fact<T> {
  id: string;
  value: T | null;
  status: FactStatus;
  sourceIds: string[];
}

export interface ProfileStaffMember {
  id: string;
  name: Fact<string>;
  role: Fact<string>;
  available: Fact<boolean>;
  skillIds: Fact<string[]>;
  /** References ProfileEquipment.id. null means the assignment is unknown. */
  assignedStationId: Fact<string>;
}

export interface ProfileSkill {
  id: string;
  name: Fact<string>;
}

export interface ProfileEquipment {
  id: string;
  name: Fact<string>;
  quantity: Fact<number>;
  available: Fact<boolean>;
  /** Simultaneous dishes, never orders per hour. */
  capacity: Fact<number>;
  capacityNotes: Fact<string>;
}

export interface ProfileMenuItem {
  id: string;
  name: Fact<string>;
  requiredSkillIds: Fact<string[]>;
  requiredEquipmentIds: Fact<string[]>;
}

export interface Profile {
  restaurant: {
    name: Fact<string>;
    cuisine: Fact<string>;
    immediateGoal: Fact<string>;
    reportedStaffCount: Fact<number>;
  };
  staff: ProfileStaffMember[];
  skills: ProfileSkill[];
  equipment: ProfileEquipment[];
  menu: ProfileMenuItem[];
}

export interface Source {
  id: string;
  kind:
    | "owner_message"
    | "owner_edit"
    | "menu_upload"
    | "ai_inference"
    | "owner_confirmation";
  text: string;
  fileName: string | null;
  location: string | null;
}

export interface Conflict {
  id: string;
  factId: string;
  proposedValue: string | number | boolean | string[];
  sourceIds: string[];
  explanation: string;
}

export interface OnboardingMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface OnboardingTopic {
  id: string;
  status: "answered" | "unknown" | "skipped";
  sourceIds: string[];
}

export interface OnboardingQuickReply {
  id: string;
  label: string;
  answer: string;
}

export interface OnboardingQuestion {
  id: string;
  topicId: string;
  text: string;
  essential: boolean;
  revisitReason: string | null;
  quickReplies: OnboardingQuickReply[];
}

export interface OnboardingReview {
  summary: string;
  unknowns: string[];
}

export interface OnboardingConfirmation {
  profileRevision: number;
  sourceId: string;
}

export interface OnboardingReadiness {
  /** Phase 1 never returns ready until task-specific analysis rules are agreed. */
  status: "task_unspecified" | "rules_pending";
  task: string | null;
  blockingFactIds: string[];
  reason: string;
}

export interface OnboardingState {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  profileRevision: number;
  profile: Profile;
  sources: Source[];
  messages: OnboardingMessage[];
  conflicts: Conflict[];
  topics: OnboardingTopic[];
  question: OnboardingQuestion | null;
  review: OnboardingReview | null;
  confirmation: OnboardingConfirmation | null;
  readiness: OnboardingReadiness;
}

export type OnboardingAction =
  | {
      type: "message";
      messageId: string;
      text: string;
      questionId: string | null;
      quickReplyId: string | null;
    }
  | { type: "answer_status"; questionId: string; status: "unknown" | "skipped" }
  | { type: "edit_fact"; factId: string; value: string | number | boolean | string[] | null }
  | { type: "add_entity"; collection: "staff" | "skills" | "equipment" | "menu"; name: string }
  | { type: "remove_entity"; collection: "staff" | "skills" | "equipment" | "menu"; entityId: string }
  | { type: "confirm_facts"; factIds: string[] }
  | { type: "resolve_conflict"; conflictId: string; choice: "keep_current" | "use_proposed" }
  | { type: "request_review" }
  | { type: "confirm_profile"; profileRevision: number };

/** POST /api/onboard request. The backend is stateless. */
export interface OnboardingRequest {
  schemaVersion: 1;
  requestId: string;
  state: OnboardingState;
  action: OnboardingAction;
}

/** POST /api/onboard success response. Replace accepted state atomically. */
export interface OnboardingResponse {
  schemaVersion: 1;
  requestId: string;
  baseRevision: number;
  state: OnboardingState;
}

export type OnboardingErrorCode =
  | "INVALID_REQUEST"
  | "STALE_CONFIRMATION"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "UNREADABLE_MENU"
  | "RATE_LIMITED"
  | "EXTRACTION_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface OnboardingErrorResponse {
  error: {
    code: OnboardingErrorCode;
    message: string;
    retryable: boolean;
    factIds: string[];
  };
  requestId: string | null;
}
