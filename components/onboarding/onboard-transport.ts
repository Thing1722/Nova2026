// Integration seam only; not connected to the entry screen yet.
// Bind State/Action and validateState to backend-owned types/validation once
// published. No partial entry draft may be sent as accepted onboarding state.
export const onboardEndpoint = "/api/onboard";

type StateIdentity = { schemaVersion: 1; sessionId: string; revision: number };
export type OnboardRequest<State extends StateIdentity, Action> = {
  schemaVersion: 1;
  requestId: string;
  state: State;
  action: Action;
};
export type OnboardResponse<State extends StateIdentity> = {
  schemaVersion: 1;
  requestId: string;
  baseRevision: number;
  state: State;
};

export class OnboardTransportError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly factIds: string[];
  constructor(
    message: string,
    code: string,
    retryable: boolean,
    factIds: string[] = [],
  ) {
    super(message);
    this.name = "OnboardTransportError";
    this.code = code;
    this.retryable = retryable;
    this.factIds = factIds;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createOnboardTransport<State extends StateIdentity, Action>(
  validateState: (value: unknown) => value is State,
  fetcher: typeof fetch = fetch,
) {
  // One in-flight action per adapter. Keep this instance stable in the UI.
  let pending = false;
  return async (
    request: OnboardRequest<State, Action>,
    signal?: AbortSignal,
  ): Promise<OnboardResponse<State>> => {
    if (pending) throw new OnboardTransportError("Wait for the current update.", "BUSY", false);
    pending = true;
    try {
      let response: Response;
      try {
        response = await fetcher(onboardEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new OnboardTransportError("Couldn't connect. Your information is still here.", "NETWORK_ERROR", true);
      }

      let payload: unknown;
      try { payload = await response.json(); }
      catch {
        throw new OnboardTransportError("Couldn't read the response. Please try again.", "INVALID_RESPONSE", true);
      }
      // The entry UI must never display raw response bodies or provider errors.
      if (!response.ok) {
        if (object(payload) && payload.requestId === request.requestId && object(payload.error)) {
          const error = payload.error;
          if (typeof error.code === "string" && typeof error.message === "string" &&
            typeof error.retryable === "boolean" && Array.isArray(error.factIds) &&
            error.factIds.every((id): id is string => typeof id === "string")) {
            throw new OnboardTransportError(error.message, error.code, error.retryable, error.factIds);
          }
        }
        throw new OnboardTransportError("Couldn't update your profile. Your information is still here.", "REQUEST_FAILED", response.status >= 500 || response.status === 429);
      }
      if (!object(payload) || payload.schemaVersion !== 1 || payload.requestId !== request.requestId ||
        payload.baseRevision !== request.state.revision || !validateState(payload.state) ||
        payload.state.sessionId !== request.state.sessionId || payload.state.schemaVersion !== 1 ||
        payload.state.revision !== request.state.revision + 1) {
        throw new OnboardTransportError("The update didn't match your current profile. Please retry.", "INVALID_RESPONSE", true);
      }
      signal?.throwIfAborted();
      return {
        schemaVersion: 1, requestId: request.requestId,
        baseRevision: request.state.revision, state: payload.state,
      };
    } finally {
      pending = false;
    }
  };
}
