# Collaboration Tracker

Statuses: **Not Started / In Progress / Completed / Blocked**. Owners update their rows and coordinate shared edits through GitHub. Read PROJECT.md and API_CONTRACT.md before implementation.

| Owner | Task | Status |
| --- | --- | --- |
| Developer 1 | Sample restaurant view and availability controls | Not Started |
| Developer 1 | Crisis input, submit, loading, and error states | Not Started |
| Developer 1 | Render recommendations and before/after metrics from exact contract | Not Started |
| Developer 2 | Shared types and sample JSON matching contract | Not Started |
| Developer 2 | Calculated availability and menu coverage metrics | Not Started |
| Developer 2 | OpenAI analysis, validation, and endpoint error handling | Not Started |
| Shared | Coordinate Next.js/configuration setup owner before installing dependencies | Not Started |
| Shared | End-to-end integration and Vercel demo | Not Started |

## Current blockers

- OpenRouter environment templates are prepared with blank key/model values; supply the key locally in `.env.local`.
- Owner clarifications in PROJECT.md require an API contract revision for timing evidence and three separate interfaces against a common baseline. New dish recommendations are now in scope.

- Implementation awaits explicit authorization. No application code or dependencies have been added.
- Before coding, both developers must sync this documentation and agree who owns shared configuration setup.

## Integration checklist

- [ ] Both branches include the shared documentation commit.
- [ ] Both agents read all three docs and follow API contract v1.
- [ ] Frontend request and backend response match the examples and field semantics.
- [ ] Unavailable-chef scenario returns valid recommendations and correct calculated metrics.
- [ ] UI distinguishes calculated metrics from AI estimates and handles empty lists and errors.
- [ ] OpenAI key is configured server-side; local demo and Vercel deployment work.

**Next integration milestone:** After explicit implementation authorization and configuration-owner agreement, complete one end-to-end unavailable-chef analysis using the sample request and exact response structure. Defer stretch features until this passes.
