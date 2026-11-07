// Entry-screen data only. Keep unsent input separate from accepted API state
// when the backend's shared onboarding types are available.
export const entryStorageKey = "shiftchef:entry:v1";

export type EntryDraft = {
  version: 1;
  started: boolean;
  name: string;
  cuisine: string;
  introduction: string;
  messages: string[];
  menuFileName: string;
};

export function createEntryDraft(): EntryDraft {
  return {
    version: 1, started: false, name: "", cuisine: "",
    introduction: "", messages: [], menuFileName: "",
  };
}

export function isEntryDraft(value: unknown): value is EntryDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as EntryDraft;
  return draft.version === 1 && typeof draft.started === "boolean" &&
    [draft.name, draft.cuisine, draft.introduction, draft.menuFileName].every((v) => typeof v === "string") &&
    Array.isArray(draft.messages) && draft.messages.every((v) => typeof v === "string");
}
