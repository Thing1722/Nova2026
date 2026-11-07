"use client";

import { useEffect, useRef, useState } from "react";
import type { OnboardingAction, OnboardingRequest, OnboardingState } from "@/types/api";
import { createOnboardingState, isOnboardingState } from "./onboarding-state";
import { createOnboardTransport, OnboardTransportError } from "./onboard-transport";

const key = "shiftchef:onboarding:v1";
export function useOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [storageIssue, setStorageIssue] = useState("");
  const accepted = useRef<OnboardingState | null>(null);
  const blocked = useRef(false);
  const active = useRef<AbortController | null>(null);
  const retry = useRef<OnboardingRequest | null>(null);
  const transport = useRef(createOnboardTransport<OnboardingState, OnboardingAction>(isOnboardingState));

  /* eslint-disable react-hooks/set-state-in-effect -- Restore browser-only external state after hydration. */
  useEffect(() => {
    let restored = createOnboardingState();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!isOnboardingState(parsed)) throw new Error("Invalid saved profile");
        restored = parsed;
      }
    } catch {
      blocked.current = true;
      setStorageIssue("Saved profile couldn't be opened. Start over to reset it.");
    }
    accepted.current = restored; setState(restored);
    const changed = (event: StorageEvent) => {
      if (event.key !== key) return;
      blocked.current = true; active.current?.abort();
      setStorageIssue("Profile changed in another tab. Reload to continue.");
    };
    window.addEventListener("storage", changed);
    return () => { active.current?.abort(); window.removeEventListener("storage", changed); };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function send(action: OnboardingAction, retryPrevious = false): Promise<boolean> {
    if (!accepted.current || active.current || blocked.current) return false;
    const request: OnboardingRequest = retryPrevious && retry.current ? retry.current : {
      schemaVersion: 1, requestId: crypto.randomUUID(), state: accepted.current, action,
    };
    retry.current = request;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setRetryable(false);
    try {
      const response = await transport.current(request, controller.signal);
      if (controller.signal.aborted || accepted.current.sessionId !== request.state.sessionId || accepted.current.revision !== response.baseRevision) return false;
      accepted.current = response.state; setState(response.state); retry.current = null;
      try { localStorage.setItem(key, JSON.stringify(response.state)); }
      catch { setStorageIssue("Progress isn't saved. Keep this tab open."); }
      return true;
    } catch (failure) {
      if (controller.signal.aborted) return false;
      setError(failure instanceof OnboardTransportError ? failure.message : "Couldn't update your profile. Try again.");
      setRetryable(failure instanceof OnboardTransportError ? failure.retryable : true);
      return false;
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  function reset() {
    active.current?.abort(); active.current = null;
    const fresh = createOnboardingState(); accepted.current = fresh; setState(fresh);
    retry.current = null; blocked.current = false; setBusy(false); setError(""); setRetryable(false); setStorageIssue("");
    try { localStorage.removeItem(key); } catch { setStorageIssue("Couldn't clear saved progress. Keep this tab open."); }
  }
  return { state, busy, error, retryable, storageIssue, send, reset,
    retry: () => retry.current ? send(retry.current.action, true) : Promise.resolve(false) };
}
