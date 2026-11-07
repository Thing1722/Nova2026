import assert from "node:assert/strict";
import test from "node:test";

import { createMessageExtractor, parseExtractionPayload } from "./extraction";
import { createOpenRouterClient } from "../ai/openrouter";
import { createInitialOnboardingState } from "./state";

test("accepts directly evidenced restaurant facts", () => {
  const message = "We are a Chinese restaurant with four cooks.";
  const result = parseExtractionPayload({
    facts: [
      {
        subject: "restaurant",
        entityName: null,
        field: "cuisine",
        value: "Chinese",
        status: "confirmed",
        correction: false,
        evidenceQuote: "Chinese restaurant",
      },
      {
        subject: "restaurant",
        entityName: null,
        field: "reportedStaffCount",
        value: 4,
        status: "confirmed",
        correction: false,
        evidenceQuote: "four cooks",
      },
    ],
  }, message);

  assert.equal(result?.facts.length, 2);
});

test("rejects invented qualifications that are absent from owner evidence", () => {
  const result = parseExtractionPayload({
    facts: [{
      subject: "staff",
      entityName: "Maya",
      field: "skillNames",
      value: ["grill"],
      status: "confirmed",
      correction: false,
      evidenceQuote: "Maya works here",
    }],
  }, "Maya works here.");

  assert.equal(result, null);
});

test("rejects unverified operational capabilities even with a quote", () => {
  const result = parseExtractionPayload({
    facts: [{
      subject: "equipment",
      entityName: "grill",
      field: "capacity",
      value: 4,
      status: "unverified",
      correction: false,
      evidenceQuote: "grill handles four dishes",
    }],
  }, "I think the grill handles four dishes.");

  assert.equal(result, null);
});

test("Luna JSON mode produces validated facts through the full mocked client boundary", async () => {
  const client = createOpenRouterClient({
    apiKey: "test-key-not-a-secret", model: "openai/gpt-6-luna",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.response_format.type, "json_object");
      assert.ok(body.messages[0].content.includes('"required"'));
      assert.ok(body.messages[0].content.includes("Do not return a JSON schema"));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [{
        subject: "restaurant", entityName: null, field: "cuisine", value: "Chinese",
        status: "confirmed", correction: false, evidenceQuote: "Chinese restaurant",
      }] }) } }] });
    },
  });
  const result = await createMessageExtractor(client).extract(createInitialOnboardingState("luna-test"), "I run a Chinese restaurant.");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.facts[0].value, "Chinese");
});

test("relaxed JSON routing still rejects wrong envelopes and fabricated qualifications", async () => {
  for (const value of [
    { type: "object", properties: { facts: {} } },
    { facts: [{ subject: "staff", entityName: "Maya", field: "skillNames", value: ["grill"], status: "confirmed", correction: false, evidenceQuote: "Maya works here" }] },
  ]) {
    const client = createOpenRouterClient({
      apiKey: "test-key-not-a-secret", model: "openai/gpt-6-luna",
      fetchImpl: async () => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    });
    assert.deepEqual(await createMessageExtractor(client).extract(createInitialOnboardingState("luna-test"), "Maya works here."), { ok: false, reason: "invalid_extraction" });
  }
});
