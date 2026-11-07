# Frontend implementation plan - Phase 1 draft

Status: planning only. No onboarding UI or endpoint is implemented by this document. Read with the revised Phase 1 docs on origin/main and ONBOARDING_CONTRACT_DRAFT.md; backend review is required before finalizing the wire contract.

## Confirmed direction

English, simple Apple-inspired clarity: light neutral surfaces, restrained accent color, system sans-serif typography, subtle borders, generous initial whitespace, and a more compact workspace as useful information grows. Avoid decorative marketing sections, large background imagery, and premature metric cards. This is an operational tool, not a copy of Apple's website.

The ui-ux-pro-max lookup supported minimal visual styling and skippable onboarding. Its marketing-hero layout and decorative restaurant typography are inappropriate here; use the owner's minimal application layout and a system font instead. Retain readable contrast, visible keyboard focus, text labels, touch targets, and reduced-motion support.

## Screen progression

| State | Main content | Direct access |
| --- | --- | --- |
| First visit | Minimal welcome and choices: Chat, Upload menu, Enter manually | Quiet, compact navigation; no populated profile or charts |
| First interaction | Chosen input path; exact welcome prompt for chat | Staff, skills, equipment, menu and profile review are always reachable |
| Profile developing | Conversation and editable profile side by side on desktop | Persistent sidebar; counts/status appear as facts arrive |
| Menu import | File selection, progress, extracted dish review and correction | Switch to chat or manual entry without discarding accepted work |
| Review | Confirmed information, unknowns, unverified facts and conflicts clearly separated | Edit individual fields, confirm, or continue chatting |
| Returning visit | Restore prior conversation, profile and selected section | Same navigation, plus a confirmed Start over action |

Interpret the requested initially blank left area as an uncluttered workspace: keep navigation labels accessible but do not fill it with empty data cards. Reveal detail after interaction rather than forcing a tutorial. On mobile use an accessible navigation drawer and a clear Chat/Profile switch; neither route requires chatting first.

Food suggestions and profile improvement options may occupy additional sections later. During Phase 1, show only actionable profile clarification/review prompts; do not invent food recommendations or implement deferred crisis interfaces.

## Implementation sequence

1. **Agree integration boundaries.** Backend agent reviews the new contract draft; agree types and offline fixtures. Sync revised main documentation into frontend before code changes. Coordinate merging the already tested Next.js setup from frontend into main instead of creating configuration again. Frontend owns app/ excluding app/api/, components/, public/; backend owns app/api/, lib/, data/, types/. Avoid editing existing shared Markdown or backend files.
2. **Create the minimal shell.** Add restrained color/spacing/type tokens and accessible responsive navigation. Implement the initial three choices and empty states. No fake analytics, prefilled real-looking restaurant, or disabled future-feature clutter.
3. **Build local state and restoration.** A single accepted-state store supports conversation and direct edits. Add schema validation, versioned local saving, storage-failure notices, draft preservation, reset confirmation, stale-response checks, and cross-tab conflict handling. Keep frontend state helpers in frontend-owned components/onboarding/ unless shared ownership is agreed.
4. **Build direct profile editors.** Staff, skills, equipment, and menu support add/edit/remove. Unknown values have explicit controls; evidence/conflicts are visible on demand. Distinguish reported headcount from named staff. Validate references and surface inline errors.
5. **Build conversation against mocks.** Free text, optional quick replies, unknown/skip, loading, retry, and one primary question per turn. Manual corrections and chat share the same profile. Preserve input and scroll position sensibly; announce meaningful updates without moving keyboard focus unexpectedly.
6. **Build menu import against mocks.** Advertise only backend-agreed formats/limits. Preview filename and import status; show extracted dishes as unverified and let owners edit/confirm/remove them. Explain original files are not retained and cannot resume after refresh. Handle unreadable files and retries without losing prior facts.
7. **Build review and confirmation.** Review is available with missing information. Separate factual confirmation from readiness, and invalidate old confirmation after relevant profile edits. Continue chat and direct editing afterward.
8. **Integrate and verify.** Replace the mock transport with agreed endpoints. Use offline mock verification from the coding agent; real application credentials stay server-side. Run build, types, lint, and focused state/interaction checks. Check narrow and desktop layouts, keyboard navigation, contrast, focus, overflow, error recovery and refresh restoration.

Each milestone should leave a reviewable working increment. On requested commits, push the frontend branch too. Merge/publish only within separately authorized scope.

## Verification scenarios

- All three starting paths remain optional and interchangeable; navigation is always reachable.
- Chinese restaurant example adds four reported cooks and three named dishes without invented capabilities.
- Conversation additions preserve manual edits; ambiguity creates an explicit conflict; corrections resolve it.
- Unknown/skipped answers do not loop; nonessential questions do not block profile review.
- Upload review distinguishes extracted information from owner-confirmed facts and supports partial confirmation.
- Refresh restores progress; interrupted request/upload explains what needs retrying and preserves accepted data.
- A response arriving after reset cannot restore the old restaurant. Another tab cannot silently overwrite progress.
- Profile confirmation does not mark a future operational task ready or convert hidden suggestions into facts.

## Remaining backend decisions

Contract approval, provider/model capability, upload support/limits, and bounded state/context sizes. These are technical coordination items; the owner has already set the product direction. No additional product decision is required to review this draft.
