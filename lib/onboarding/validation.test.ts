import assert from "node:assert/strict";
import test from "node:test";
import { createInitialOnboardingState } from "./state";
import { validateOnboardingStateShape } from "./validation";

test("state validation accepts valid message/topic arrays and rejects duplicates", () => {
  const state = createInitialOnboardingState("validation-test");
  state.messages = [{ id: "message-1", role: "user", text: "Hello" }];
  state.topics = [{ id: "topic-1", status: "skipped", sourceIds: [] }];
  assert.equal(validateOnboardingStateShape(state), true);
  assert.equal(validateOnboardingStateShape({ ...state, messages: [...state.messages, ...state.messages] }), false);
  assert.equal(validateOnboardingStateShape({ ...state, topics: [...state.topics, ...state.topics] }), false);
});

test("state validation rejects malformed messages and topics before checking IDs", () => {
  const state = createInitialOnboardingState("validation-test");
  for (const malformed of [null, {}, [null], [{ id: "broken" }]]) {
    assert.equal(validateOnboardingStateShape({ ...state, messages: malformed }), false);
    assert.equal(validateOnboardingStateShape({ ...state, topics: malformed }), false);
  }
});
