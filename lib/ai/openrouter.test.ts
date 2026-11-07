import assert from "node:assert/strict";
import test from "node:test";

import { createOpenRouterClient } from "./openrouter";

const request = {
  schemaName: "test_schema",
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  systemPrompt: "Return JSON.",
  userPrompt: "Test input.",
};

test("does not call the network when runtime configuration is missing", async () => {
  let called = false;
  const client = createOpenRouterClient({
    apiKey: "",
    model: "",
    fetchImpl: async () => { called = true; throw new Error("unexpected"); },
  });

  assert.deepEqual(await client.completeStructured(request), { ok: false, reason: "unconfigured" });
  assert.equal(called, false);
});

test("requests structured JSON and parses a mocked response", async () => {
  let authorization = "";
  let sentBody: Record<string, unknown> = {};
  const client = createOpenRouterClient({
    apiKey: "test-key-not-a-secret",
    model: "test/model",
    fetchImpl: async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] });
    },
  });

  const result = await client.completeStructured(request);

  assert.deepEqual(result, { ok: true, value: { ok: true } });
  assert.equal(authorization, "Bearer test-key-not-a-secret");
  assert.equal((sentBody.response_format as { type: string }).type, "json_schema");
});

test("returns a safe failure for invalid provider output", async () => {
  const client = createOpenRouterClient({
    apiKey: "test-key-not-a-secret",
    model: "test/model",
    fetchImpl: async () => Response.json({ choices: [{ message: { content: "not-json" } }] }),
  });

  assert.deepEqual(await client.completeStructured(request), { ok: false, reason: "invalid_response" });
});
