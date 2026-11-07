import type { Fact, OnboardingAction, OnboardingState } from "@/types/api";

type Collection = "staff" | "skills" | "equipment" | "menu";
type Props = { state: OnboardingState; collection: Collection; busy: boolean; send: (action: OnboardingAction) => Promise<boolean> };
const labels: Record<string, string> = {
  name: "Name", role: "Role", available: "Available", skillIds: "Skills", assignedStationId: "Assigned station",
  quantity: "Quantity", capacity: "Simultaneous dishes", capacityNotes: "Capacity notes",
  requiredSkillIds: "Required skills", requiredEquipmentIds: "Required equipment", cuisine: "Cuisine", immediateGoal: "Your goal", reportedStaffCount: "Staff count",
};

function Field({ fact, field, state, busy, send }: { fact: Fact<unknown>; field: string; state: OnboardingState; busy: boolean; send: Props["send"] }) {
  const options = field === "skillIds" || field === "requiredSkillIds" ? state.profile.skills : state.profile.equipment;
  const list = ["skillIds", "requiredSkillIds", "requiredEquipmentIds"].includes(field);
  const station = field === "assignedStationId";
  const numeric = ["quantity", "capacity", "reportedStaffCount"].includes(field);
  const conflict = state.conflicts.find((item) => item.factId === fact.id);
  return <div className="profile-field">
    <form onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const raw = String(data.get("value") ?? "").trim();
      const value = list ? data.getAll("value").map(String) : raw === "" ? null : field === "available" ? raw === "true" : numeric ? Number(raw) : raw;
      void send({ type: "edit_fact", factId: fact.id, value });
    }}>
      <div className="field-label"><label htmlFor={fact.id}>{labels[field] || field}</label><span className="fact-status">{conflict ? "Conflict" : fact.status === "confirmed" ? "Confirmed" : fact.status === "unverified" ? "Needs review" : "Unknown"}</span></div>
      <div className="fact-input-row">
        {list ? <select id={fact.id} name="value" multiple disabled={busy} defaultValue={Array.isArray(fact.value) ? fact.value : []} aria-describedby={`${fact.id}-hint`}>{options.map((option) => <option key={option.id} value={option.id}>{option.name.value || "Unnamed"}</option>)}</select> : field === "available" ? <select id={fact.id} name="value" disabled={busy} defaultValue={fact.value === null ? "" : String(fact.value)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select> : station ? <select id={fact.id} name="value" disabled={busy} defaultValue={typeof fact.value === "string" ? fact.value : ""}><option value="">Unknown</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name.value || "Unnamed"}</option>)}</select> : <input id={fact.id} name="value" type={numeric ? "number" : "text"} min={numeric ? 0 : undefined} step={numeric ? 1 : undefined} maxLength={numeric ? undefined : 500} disabled={busy} defaultValue={typeof fact.value === "string" || typeof fact.value === "number" ? fact.value : ""} placeholder="Unknown" />}
        <button className="secondary-button" disabled={busy}>Save</button>
      </div>
      {list && <p id={`${fact.id}-hint`} className="muted-copy">Select all that apply. Saving an empty selection means none.</p>}
    </form>
    {fact.sourceIds.length > 0 && <details className="evidence"><summary>Source</summary>{fact.sourceIds.map((id) => <p key={id}>{state.sources.find((source) => source.id === id)?.text || "Source unavailable"}</p>)}</details>}
    {fact.status === "unverified" && !conflict && <button className="text-button" disabled={busy} onClick={() => void send({ type: "confirm_facts", factIds: [fact.id] })}>Confirm this detail</button>}
    {conflict && <div className="status-note"><p>{conflict.explanation}</p><p>Suggested: {Array.isArray(conflict.proposedValue) ? conflict.proposedValue.join(", ") : String(conflict.proposedValue)}</p><div className="quick-replies"><button className="secondary-button" disabled={busy} onClick={() => void send({ type: "resolve_conflict", conflictId: conflict.id, choice: "keep_current" })}>Keep current</button><button className="secondary-button" disabled={busy} onClick={() => void send({ type: "resolve_conflict", conflictId: conflict.id, choice: "use_proposed" })}>Use suggested</button></div></div>}
  </div>;
}

export function ProfileEditor({ state, collection, busy, send }: Props) {
  const entities = state.profile[collection];
  return <div className="profile-editor">
    <form className="add-entity" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = String(new FormData(form).get("name") ?? "").trim();
      if (name && await send({ type: "add_entity", collection, name })) form.reset();
    }}><label htmlFor={`add-${collection}`}>Add {collection === "staff" ? "a staff member" : collection === "menu" ? "a dish" : collection === "skills" ? "a skill" : "equipment"}</label><div className="fact-input-row"><input id={`add-${collection}`} name="name" required maxLength={150} placeholder="Name" disabled={busy} /><button className="primary-button" disabled={busy}>Add</button></div></form>
    {entities.length === 0 && <p className="panel-description">Nothing added yet.</p>}
    {entities.map((entity) => <details className="entity-editor" key={entity.id}><summary>{entity.name.value || "Unnamed"}<span className="fact-status">{entity.name.status === "confirmed" ? "Confirmed" : "Needs review"}</span></summary><div>{Object.entries(entity).filter(([key]) => key !== "id").map(([field, fact]) => <Field key={`${(fact as Fact<unknown>).id}-${state.profileRevision}`} field={field} fact={fact as Fact<unknown>} state={state} busy={busy} send={send} />)}<button className="text-button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${entity.name.value || "this item"}?`)) void send({ type: "remove_entity", collection, entityId: entity.id }); }}>Remove</button></div></details>)}
  </div>;
}

export function RestaurantEditor({ state, busy, send }: Omit<Props, "collection">) {
  return <div className="profile-editor">{Object.entries(state.profile.restaurant).map(([field, fact]) => <Field key={`${fact.id}-${state.profileRevision}`} field={field} fact={fact} state={state} busy={busy} send={send} />)}</div>;
}
