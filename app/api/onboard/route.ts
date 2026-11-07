import type { OnboardingErrorResponse } from "../../../types/api";
import { createOpenRouterClient } from "../../../lib/ai/openrouter";
import { createMessageExtractor } from "../../../lib/onboarding/extraction";
import { OnboardingError, processOnboardingRequest } from "../../../lib/onboarding/state";
import { parseOnboardingRequest, requestBodyWithinLimit } from "../../../lib/onboarding/validation";

export const runtime = "nodejs";

const extractor = createMessageExtractor(createOpenRouterClient());

export async function POST(request: Request): Promise<Response> {
  let requestId: string | null = null;
  try {
    if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
      return errorResponse(400, "INVALID_REQUEST", "Content-Type must be application/json.", false, [], null);
    }
    const text = await request.text();
    if (!requestBodyWithinLimit(text)) {
      return errorResponse(400, "INVALID_REQUEST", "The onboarding request is too large.", false, [], null);
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return errorResponse(400, "INVALID_REQUEST", "Request body must be valid JSON.", false, [], null);
    }
    if (isRecord(body) && typeof body.requestId === "string") requestId = body.requestId;
    const parsed = parseOnboardingRequest(body);
    if (!parsed.ok) {
      return errorResponse(400, "INVALID_REQUEST", parsed.message, false, parsed.factIds, requestId);
    }
    const response = await processOnboardingRequest(parsed.value, { extractor });
    return Response.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof OnboardingError) {
      return errorResponse(error.status, error.code, error.message, error.retryable, error.factIds, requestId);
    }
    return errorResponse(500, "INTERNAL_ERROR", "The onboarding request could not be completed.", true, [], requestId);
  }
}

function errorResponse(
  status: number,
  code: OnboardingErrorResponse["error"]["code"],
  message: string,
  retryable: boolean,
  factIds: string[],
  requestId: string | null,
): Response {
  const body: OnboardingErrorResponse = {
    error: { code, message, retryable, factIds },
    requestId,
  };
  return Response.json(body, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
