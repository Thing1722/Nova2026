import assert from "node:assert/strict";
import test from "node:test";

import { parseExtractionPayload } from "./extraction";

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
