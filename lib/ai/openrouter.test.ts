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

test("Luna uses JSON mode and includes the schema in its system instructions", async () => {
  for (const model of ["openai/gpt-6-luna", "openai/gpt-6-luna-pro", "~openai/gpt-luna-latest"]) {
    let calls = 0;
    const client = createOpenRouterClient({
      apiKey: "test-key-not-a-secret", model,
      fetchImpl: async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(body.response_format, { type: "json_object" });
        assert.equal(body.provider, undefined);
        assert.ok(body.messages[0].content.includes(JSON.stringify(request.schema)));
        assert.ok(body.messages[0].content.includes("not the schema itself"));
        return Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
      },
    });
    assert.deepEqual(await client.completeStructured(request), { ok: true, value: { ok: true } });
    assert.equal(calls, 1);
  }
});

test("rejects truncated output even when the JSON prefix is parseable", async () => {
  const client = createOpenRouterClient({
    apiKey: "test-key-not-a-secret", model: "openai/gpt-6-luna",
    fetchImpl: async () => Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "length" }] }),
  });
  assert.deepEqual(await client.completeStructured(request), { ok: false, reason: "invalid_response" });
});

test("routing failures and rate limits remain safe failures without extra requests", async () => {
  for (const [status, reason] of [[404, "routing"], [429, "rate_limited"]] as const) {
    let calls = 0;
    const client = createOpenRouterClient({
      apiKey: "test-key-not-a-secret", model: "openai/gpt-6-luna",
      fetchImpl: async () => { calls++; return Response.json({ error: { message: "private provider details" } }, { status }); },
    });
    assert.deepEqual(await client.completeStructured(request), { ok: false, reason });
    assert.equal(calls, 1);
  }
});
