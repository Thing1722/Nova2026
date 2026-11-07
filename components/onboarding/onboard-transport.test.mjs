import assert from "node:assert/strict";
import { test } from "node:test";
import { createOnboardTransport } from "./onboard-transport.ts";
import { createEntryDraft, isEntryDraft } from "./entry-draft.ts";
import { createOnboardingState, isOnboardingState } from "./onboarding-state.ts";

const state = { schemaVersion: 1, sessionId: "session-1", revision: 0 };
const request = { schemaVersion: 1, requestId: "request-1", state, action: { type: "request_review" } };
const valid = (value) => value?.schemaVersion === 1 && typeof value.sessionId === "string" && Number.isInteger(value.revision);
const success = () => ({ schemaVersion: 1, requestId: request.requestId, baseRevision: 0, state: { ...state, revision: 1 } });

test("posts the full envelope to /api/onboard without mutating accepted state", async () => {
  const transport = createOnboardTransport(valid, async (url, options) => {
    assert.equal(url, "/api/onboard");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), request);
    return Response.json(success());
  });
  assert.equal((await transport(request)).state.revision, 1);
  assert.equal(state.revision, 0);
});

test("rejects stale, cross-session, and invalid responses", async () => {
  for (const bad of [
    { ...success(), requestId: "old-request" },
    { ...success(), baseRevision: 5 },
    { ...success(), state: { ...state, sessionId: "another", revision: 1 } },
    { ...success(), state: { ...state, revision: 7 } },
    { ...success(), state: null },
  ]) {
    const transport = createOnboardTransport(valid, async () => Response.json(bad));
    await assert.rejects(transport(request), { code: "INVALID_RESPONSE" });
  }
});

test("handles HTML failures without exposing the response body", async () => {
  const transport = createOnboardTransport(valid, async () => new Response("private provider detail", { status: 502 }));
  await assert.rejects(transport(request), (error) => error.code === "INVALID_RESPONSE" && !error.message.includes("private"));
});

test("retains safe field errors from the matching response", async () => {
  const transport = createOnboardTransport(valid, async () => Response.json({
    requestId: request.requestId,
    error: { code: "INVALID_REQUEST", message: "Check the name.", retryable: false, factIds: ["name-1"] },
  }, { status: 400 }));
  await assert.rejects(transport(request), (error) => error.code === "INVALID_REQUEST" && error.factIds[0] === "name-1" && !error.retryable);
});

test("blocks concurrent actions and permits retry after failure", async () => {
  let release;
  const transport = createOnboardTransport(valid, () => new Promise((resolve) => { release = resolve; }));
  const first = transport(request);
  await assert.rejects(transport(request), { code: "BUSY" });
  release(Response.json(success()));
  await first;
  const retry = transport(request);
  release(Response.json(success()));
  await retry;
});

test("preserves cancellation instead of presenting a network error", async () => {
  const controller = new AbortController();
  const transport = createOnboardTransport(valid, async () => {
    controller.abort();
    throw new DOMException("Cancelled", "AbortError");
  });
  await assert.rejects(transport(request, controller.signal), { name: "AbortError" });
});

test("local entry drafts remain separate from accepted API state", () => {
  const first = createEntryDraft();
  first.messages.push("An unsent local note");
  assert.deepEqual(createEntryDraft().messages, []);
  assert.equal(isEntryDraft(first), true);
  assert.equal(isEntryDraft(state), false);
  assert.equal(isEntryDraft({ ...first, messages: [1] }), false);
});

test("initial accepted state preserves unknowns and validates against the client boundary", () => {
  const initial = createOnboardingState();
  assert.equal(isOnboardingState(initial), true);
  assert.equal(initial.profile.restaurant.reportedStaffCount.value, null);
  assert.deepEqual(initial.profile.staff, []);
  assert.equal(initial.readiness.status, "task_unspecified");
  assert.equal(isOnboardingState({ ...initial, readiness: { ...initial.readiness, status: "ready" } }), false);
  assert.equal(isOnboardingState({ ...initial, question: { text: "Incomplete question" } }), false);
  assert.equal(isOnboardingState({ ...initial, profile: { ...initial.profile, staff: [{ id: "staff-1" }] } }), false);
  assert.equal(isOnboardingState({ ...initial, review: { summary: "A review", unknowns: [7] } }), false);
});
