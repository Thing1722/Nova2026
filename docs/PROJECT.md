# ShiftChef AI — MVP

**Target user:** A small restaurant owner managing an unexpected staffing disruption.

**Goal:** Demonstrate a complete restaurant crisis recovery flow within a four-hour hackathon. Stack: Next.js App Router, TypeScript, Tailwind CSS, OpenAI API, JSON mock data; deployment target: Vercel.

## Essential flow

1. View a sample restaurant's employees, skills, availability, equipment, and menu.
2. Mark a chef unavailable and describe the crisis, for example: “Maya called in sick before dinner. How can we keep service running?”
3. Submit the restaurant snapshot and problem to `POST /api/analyze` using `API_CONTRACT.md`.
4. Display the summary, staffing changes, affected dishes, menu suggestions, risks, and assumptions.
5. Compare baseline metrics with projected recovery metrics. Label calculated values separately from AI estimates.

## Acceptance criteria

- Sample restaurant details are visible and the owner can enter a crisis and change staff availability.
- A successful submission returns real AI recommendations through the server endpoint, with valid JSON matching the contract.
- Recommendations identify staff and dishes using the request IDs and respect availability, skills, and equipment constraints.
- All response sections render, including empty lists, and before/after metrics show their origin and units.
- The UI handles loading, invalid input, and endpoint failures without crashing; backend secrets stay server-side.
- Both branches integrate into a runnable local demo; Vercel deployment is the final delivery target.

## Scope limits

New dish recommendations are in requested scope, subject to revising the API contract before implementation.

## Owner clarifications

- Use OpenRouter for model access. Store the server-side key in `OPENROUTER_API_KEY` in `.env.local`; `OPENROUTER_MODEL` selects the model, which has not yet been chosen. `.env.example` provides a shareable template.
- Estimate preparation time for each chef using owner-entered data, web research on typical dish durations, and expected order volume. Track input origins, cite retrieved web evidence, and distinguish measured times from estimates.
- Staffing risks, staffing recommendations, and new dish recommendations are three separate interfaces, each compared against the same default baseline: normal operations with all staff available.
- Contract v1 needs revision to represent chef-specific timing, order mix, web evidence, new dishes, and separate scenario comparisons. Existing references to the OpenAI API should be understood as model access through OpenRouter.
- Before implementing the revised contract, define timing input units, order distribution, and the web-search provider. The revised contract must represent the confirmed all-staff-available baseline consistently across all three interfaces. Skill coverage alone does not measure service capacity.

Out of scope: authentication, databases, persistent storage, multi-restaurant accounts, scheduling systems, POS integrations, inventory management, payments, live staffing feeds, and production optimization guarantees. Recommendations require the owner's judgment; AI estimates are not measured outcomes.
