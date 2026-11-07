"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const storageKey = "shiftchef:entry:v1";
const sections = ["Overview", "Conversation", "Menu", "Staff", "Skills", "Equipment"] as const;
type Section = (typeof sections)[number];
type Path = "chat" | "upload" | "manual";
// Local entry-screen draft only. This is not the proposed onboarding API model.
type Draft = {
  version: 1;
  started: boolean;
  name: string;
  cuisine: string;
  introduction: string;
  messages: string[];
  menuFileName: string;
};
const empty: Draft = { version: 1, started: false, name: "", cuisine: "", introduction: "", messages: [], menuFileName: "" };

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const d = value as Draft;
  return d.version === 1 && typeof d.started === "boolean" &&
    [d.name, d.cuisine, d.introduction, d.menuFileName].every((v) => typeof v === "string") &&
    Array.isArray(d.messages) && d.messages.every((v) => typeof v === "string");
}

function Icon({ kind, className = "" }: { kind: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 10h8M8 14h5" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
    manual: <><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    mark: <><path d="M8 10a4 4 0 1 1 8 0M5 10h14l-1 10H6L5 10Z" /><path d="M9 14v2m6-2v2" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  };
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] || paths.grid}</svg>;
}

export function Welcome() {
  const [draft, setDraft] = useState<Draft>(empty);
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState<Path | null>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [notice, setNotice] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const panel = useRef<HTMLHeadingElement>(null);

  // Browser-only storage is restored after hydration; this effect intentionally
  // synchronizes React state with an external system, not derived props.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!isDraft(parsed)) throw new Error("Invalid saved draft");
        setDraft(parsed);
        if (parsed.started) setPath("manual");
      }
    } catch {
      setNotice("Saved progress could not be opened. You can continue here or use Start over to clear it.");
      setStorageBlocked(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || storageBlocked) return;
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); }
    catch { setNotice("Progress isn't saved in this browser. Keep this tab open to continue."); }
  }, [draft, ready, storageBlocked]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setStorageBlocked(true);
      setNotice("Progress changed in another tab. Reload this page to use that version. Your current work stays here until you reload.");
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  function open(next: Path) {
    setPath(next);
    setSection(next === "chat" ? "Conversation" : next === "upload" ? "Menu" : "Overview");
    requestAnimationFrame(() => panel.current?.focus());
  }
  function navigate(next: Section) {
    setSection(next);
    setPath(next === "Conversation" ? "chat" : next === "Menu" ? "upload" : next === "Overview" ? "manual" : null);
    requestAnimationFrame(() => panel.current?.focus());
  }
  function saveBasics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() && !draft.cuisine.trim()) return;
    setDraft({ ...draft, name: draft.name.trim(), cuisine: draft.cuisine.trim(), started: true });
    setNotice("Restaurant details saved on this browser.");
  }
  function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.introduction.trim()) return;
    setDraft({ ...draft, messages: [...draft.messages, draft.introduction.trim()], introduction: "", started: true });
    setNotice("Your introduction is saved. AI replies will be available when conversation setup is connected.");
  }
  function reset() {
    if (!window.confirm("Start over? This clears the restaurant details and notes saved in this browser.")) return;
    try { localStorage.removeItem(storageKey); } catch { /* Keep the in-memory reset available. */ }
    setStorageBlocked(false); setDraft({ ...empty }); setPath(null); setSection("Overview"); setFile(null); setNotice("");
  }

  const options: { id: Path; title: string; detail: string; link: string }[] = [
    { id: "chat", title: "Let's talk", detail: "Tell us a little. Build your restaurant profile one conversation at a time.", link: "Start a conversation" },
    { id: "upload", title: "Start with your menu", detail: "Have a menu handy? Use it as the starting point for your restaurant.", link: "Upload a menu" },
    { id: "manual", title: "Make it your own", detail: "Prefer to fill things in yourself? Start with the details you know.", link: "Enter details manually" },
  ];

  return <div className={`site ${draft.started ? "has-workspace" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="brand"><span className="brand-mark"><Icon kind="mark" /></span><span>ShiftChef<span className="brand-ai"> AI</span></span></div>
      {(draft.started || storageBlocked) && <button className="text-button" onClick={reset}>Start over</button>}
    </header>
    <div className="app-body">
      {draft.started && <aside className="sidebar"><p className="eyebrow">YOUR RESTAURANT</p><p className="sidebar-name">{draft.name || "Your workspace"}</p><nav aria-label="Restaurant sections">{sections.map((item) => <button key={item} aria-current={section === item ? "page" : undefined} onClick={() => navigate(item)}><Icon kind={item === "Conversation" ? "chat" : "grid"} /><span>{item}</span></button>)}</nav><p className="sidebar-footer">A profile that grows<br />with your restaurant.</p></aside>}
      <main id="main" className={draft.started ? "workspace-main" : "welcome-main"}>
        {!draft.started && <section className="welcome-heading"><h1>How would you like to start?</h1></section>}
        {!draft.started && <div className="entry-options">{options.map((option) => <button className={`entry-card ${path === option.id ? "selected" : ""}`} key={option.id} onClick={() => open(option.id)} aria-pressed={path === option.id}><span className={`option-icon ${option.id}`}><Icon kind={option.id} /></span><h2>{option.title}</h2><p>{option.detail}</p><span className="card-link">{option.link}<Icon kind="arrow" /></span></button>)}</div>}
        {ready && (path || draft.started) && <section className="entry-panel" aria-labelledby="panel-heading">
          <div className="panel-top"><span className="eyebrow">{draft.started ? "YOUR WORKSPACE" : "START ANYWHERE"}</span>{!draft.started && <button className="text-button" onClick={() => setPath(null)}>Close</button>}</div>
          <h2 id="panel-heading" ref={panel} tabIndex={-1}>{path === "chat" ? "Tell us about your restaurant." : path === "upload" ? "Your menu is a great start." : section === "Overview" ? "The basics. At your pace." : section}</h2>
          {path === "chat" && <><p className="panel-description">Tell me a little about your restaurant. You can start with anything — your employees, menu, kitchen equipment, or the challenges you&apos;re facing.</p>{draft.messages.length > 0 && <div className="saved-messages">{draft.messages.map((message, index) => <div className="saved-message" key={index}><span className="eyebrow">YOUR NOTE</span><p>{message}</p></div>)}</div>}<form onSubmit={saveMessage}><label htmlFor="introduction">What would you like us to know?</label><textarea autoFocus={false} id="introduction" rows={4} maxLength={5000} value={draft.introduction} onChange={(e) => setDraft({ ...draft, introduction: e.target.value })} placeholder="I run a small restaurant with four cooks…" /><div className="form-bottom"><p>AI conversation isn&apos;t connected yet. Your notes stay saved here.</p><button className="primary-button" disabled={!draft.introduction.trim()}>Save introduction<Icon kind="arrow" /></button></div></form></>}
          {path === "manual" && <><p className="panel-description">Start with either detail. You can add more whenever you&apos;re ready.</p><form onSubmit={saveBasics}><div className="field-grid"><div><label htmlFor="restaurant-name">Restaurant name <span>(optional)</span></label><input id="restaurant-name" maxLength={150} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="What do you call your place?" /></div><div><label htmlFor="cuisine">Cuisine <span>(optional)</span></label><input id="cuisine" maxLength={150} value={draft.cuisine} onChange={(e) => setDraft({ ...draft, cuisine: e.target.value })} placeholder="For example, Chinese or Italian" /></div></div><div className="form-bottom"><p>Only the details you enter are saved.</p><button className="primary-button" disabled={!draft.name.trim() && !draft.cuisine.trim()}>Save details<Icon kind="arrow" /></button></div></form></>}
          {path === "upload" && <><p className="panel-description">Choose a menu to begin. Automatic dish extraction isn&apos;t connected yet; no file will be sent or analyzed.</p><div className="upload-box"><Icon kind="upload" /><label htmlFor="menu-file">Choose a menu file</label><input id="menu-file" type="file" onChange={(e) => { const chosen = e.target.files?.[0] || null; setFile(chosen); }} /><p>Your file stays on this device.</p></div>{file && <div className="form-bottom"><p>{file.name}</p><button className="primary-button" onClick={() => { setDraft({ ...draft, menuFileName: file.name, started: true }); setNotice("Menu filename saved. Dish extraction is not available yet."); }}>Save menu reference<Icon kind="arrow" /></button></div>}{draft.menuFileName && <p className="file-note">Menu reference: <strong>{draft.menuFileName}</strong>. The original file is not saved across refreshes. Select it again when extraction becomes available.</p>}</>}
          {!path && draft.started && <><p className="panel-description">No {section.toLowerCase()} have been added yet. This section will grow with your restaurant profile.</p><p className="coming-note">Detailed {section.toLowerCase()} editing is coming next. You can keep notes in the meantime.</p><button className="primary-button" onClick={() => open("chat")}>Add a note<Icon kind="arrow" /></button></>}
        </section>}
        {notice && <div className="status-note" role="status">{notice}</div>}
      </main>
    </div>
    <footer className="site-footer"><span>Saved on this browser.</span></footer>
  </div>;
}
