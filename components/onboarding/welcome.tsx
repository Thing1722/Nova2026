"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createEntryDraft, entryStorageKey as storageKey, isEntryDraft } from "./entry-draft";
import type { EntryDraft } from "./entry-draft";
import { useOnboarding } from "./use-onboarding";
import { Conversation } from "./conversation";
import { ProfileEditor, RestaurantEditor } from "./profile-editor";

const sections = ["Overview", "Conversation", "Menu", "Staff", "Skills", "Equipment"] as const;
type Section = (typeof sections)[number];
type Path = "chat" | "upload" | "manual";

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
  const onboarding = useOnboarding();
  const [draft, setDraft] = useState<EntryDraft>(createEntryDraft);
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState<Path | null>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [notice, setNotice] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const panel = useRef<HTMLHeadingElement>(null);
  const started = draft.started || (onboarding.state?.revision ?? 0) > 0;

  // Browser-only storage is restored after hydration; this effect intentionally
  // synchronizes React state with an external system, not derived props.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!isEntryDraft(parsed)) throw new Error("Invalid saved draft");
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
  async function saveBasics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!draft.name.trim() && !draft.cuisine.trim()) || !onboarding.state || onboarding.busy) return;
    const restaurant = onboarding.state.profile.restaurant;
    if (draft.name.trim() && draft.name.trim() !== restaurant.name.value) {
      if (!await onboarding.send({ type: "edit_fact", factId: restaurant.name.id, value: draft.name.trim() })) return;
    }
    if (draft.cuisine.trim() && draft.cuisine.trim() !== restaurant.cuisine.value) {
      if (!await onboarding.send({ type: "edit_fact", factId: restaurant.cuisine.id, value: draft.cuisine.trim() })) return;
    }
    setDraft({ ...draft, name: draft.name.trim(), cuisine: draft.cuisine.trim(), started: true });
    setNotice("Details saved.");
  }
  function reset() {
    if (!window.confirm("Start over? This clears the restaurant details and notes saved in this browser.")) return;
    try { localStorage.removeItem(storageKey); } catch { /* Keep the in-memory reset available. */ }
    onboarding.reset();
    setStorageBlocked(false); setDraft(createEntryDraft()); setPath(null); setSection("Overview"); setFile(null); setNotice("");
  }

  const options: { id: Path; title: string; detail: string; link: string }[] = [
    { id: "chat", title: "Let's talk", detail: "Tell us a little. Build your restaurant profile one conversation at a time.", link: "Start a conversation" },
    { id: "upload", title: "Start with your menu", detail: "Have a menu handy? Use it as the starting point for your restaurant.", link: "Upload a menu" },
    { id: "manual", title: "Make it your own", detail: "Prefer to fill things in yourself? Start with the details you know.", link: "Enter details manually" },
  ];

  return <div className={`site ${started ? "has-workspace" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="brand"><span className="brand-mark"><Icon kind="mark" /></span><span>ShiftChef<span className="brand-ai"> AI</span></span></div>
      {(started || storageBlocked) && <button className="text-button" onClick={reset}>Start over</button>}
    </header>
    <div className="app-body">
      {started && <aside className="sidebar"><p className="eyebrow">YOUR RESTAURANT</p><p className="sidebar-name">{onboarding.state?.profile.restaurant.name.value || draft.name || "Your workspace"}</p><nav aria-label="Restaurant sections">{sections.map((item) => <button key={item} aria-current={section === item ? "page" : undefined} onClick={() => navigate(item)}><Icon kind={item === "Conversation" ? "chat" : "grid"} /><span>{item}</span></button>)}</nav><p className="sidebar-footer">A profile that grows<br />with your restaurant.</p></aside>}
      <main id="main" className={started ? "workspace-main" : "welcome-main"}>
        {!started && <section className="welcome-heading"><h1>How would you like to start?</h1></section>}
        {!started && <div className="entry-options">{options.map((option) => <button className={`entry-card ${path === option.id ? "selected" : ""}`} key={option.id} onClick={() => open(option.id)} aria-pressed={path === option.id}><span className={`option-icon ${option.id}`}><Icon kind={option.id} /></span><h2>{option.title}</h2><p>{option.detail}</p><span className="card-link">{option.link}<Icon kind="arrow" /></span></button>)}</div>}
        {ready && (path || started) && <section className="entry-panel" aria-labelledby="panel-heading">
          <div className="panel-top"><span className="eyebrow">{started ? "YOUR WORKSPACE" : "START ANYWHERE"}</span>{!started && <button className="text-button" onClick={() => setPath(null)}>Close</button>}</div>
          <h2 id="panel-heading" ref={panel} tabIndex={-1}>{path === "chat" ? "Tell us about your restaurant." : path === "upload" ? "Your menu is a great start." : section === "Overview" ? "The basics. At your pace." : section}</h2>
          {path === "chat" && <Conversation state={onboarding.state} busy={onboarding.busy} input={draft.introduction} onInput={(introduction) => setDraft((current) => ({ ...current, introduction }))} send={onboarding.send} previousNotes={draft.messages} onStarted={() => setDraft((current) => ({ ...current, started: true }))} />}
          {path === "manual" && !started && <><p className="panel-description">Start with either detail. You can add more whenever you&apos;re ready.</p><form onSubmit={saveBasics}><div className="field-grid"><div><label htmlFor="restaurant-name">Restaurant name <span>(optional)</span></label><input id="restaurant-name" maxLength={150} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="What do you call your place?" /></div><div><label htmlFor="cuisine">Cuisine <span>(optional)</span></label><input id="cuisine" maxLength={150} value={draft.cuisine} onChange={(e) => setDraft({ ...draft, cuisine: e.target.value })} placeholder="For example, Chinese or Italian" /></div></div><div className="form-bottom"><p>Only the details you enter are saved.</p><button className="primary-button" disabled={onboarding.busy || !onboarding.state || (!draft.name.trim() && !draft.cuisine.trim())}>Save details<Icon kind="arrow" /></button></div></form></>}
          {path === "upload" && <><p className="panel-description">Choose a menu to begin. Automatic dish extraction isn&apos;t connected yet; no file will be sent or analyzed.</p><div className="upload-box"><Icon kind="upload" /><label htmlFor="menu-file">Choose a menu file</label><input id="menu-file" type="file" onChange={(e) => { const chosen = e.target.files?.[0] || null; setFile(chosen); }} /><p>Your file stays on this device.</p></div>{file && <div className="form-bottom"><p>{file.name}</p><button className="primary-button" onClick={() => { setDraft({ ...draft, menuFileName: file.name, started: true }); setNotice("Menu filename saved. Dish extraction is not available yet."); }}>Save menu reference<Icon kind="arrow" /></button></div>}{draft.menuFileName && <p className="file-note">Menu reference: <strong>{draft.menuFileName}</strong>. The original file is not saved across refreshes. Select it again when extraction becomes available.</p>}</>}
          {onboarding.state && started && section === "Overview" && <RestaurantEditor state={onboarding.state} busy={onboarding.busy} send={onboarding.send} />}
          {onboarding.state && started && (section === "Staff" || section === "Skills" || section === "Equipment" || section === "Menu") && <ProfileEditor state={onboarding.state} collection={section.toLowerCase() as "staff" | "skills" | "equipment" | "menu"} busy={onboarding.busy} send={onboarding.send} />}
          {section === "Overview" && started && onboarding.state && <div className="profile-review"><h3>Profile review</h3><button className="secondary-button" disabled={onboarding.busy} onClick={() => void onboarding.send({ type: "request_review" })}>{onboarding.busy ? "Updating…" : "Review profile"}</button>{onboarding.state.review && <><p className="review-summary">{onboarding.state.review.summary}</p>{onboarding.state.review.unknowns.length > 0 && <details><summary>Still unknown</summary><ul>{onboarding.state.review.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}<button className="primary-button" disabled={onboarding.busy || onboarding.state.conflicts.length > 0 || onboarding.state.confirmation?.profileRevision === onboarding.state.profileRevision} onClick={() => void onboarding.send({ type: "confirm_profile", profileRevision: onboarding.state!.profileRevision })}>{onboarding.state.confirmation?.profileRevision === onboarding.state.profileRevision ? "Profile confirmed" : "Confirm profile"}</button></>}<p className="muted-copy">{onboarding.state.readiness.status === "task_unspecified" ? "Your goal is not set yet." : "Operational analysis isn't available yet."}</p></div>}
        </section>}
        {onboarding.error && <div className="status-note" role="alert">{onboarding.error}{onboarding.retryable && <button className="text-button" disabled={onboarding.busy} onClick={() => void onboarding.retry()}>Retry</button>}</div>}
        {onboarding.storageIssue && <div className="status-note" role="status">{onboarding.storageIssue}</div>}
        {notice && <div className="status-note" role="status">{notice}</div>}
      </main>
    </div>
    <footer className="site-footer"><span>Saved on this browser.</span></footer>
  </div>;
}
