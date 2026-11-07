import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import type { OnboardingAction, OnboardingState } from "@/types/api";

type Props = {
  state: OnboardingState | null;
  busy: boolean;
  input: string;
  onInput: (value: string) => void;
  send: (action: OnboardingAction) => Promise<boolean>;
  onStarted: () => void;
  previousNotes: string[];
};
export function Conversation({ state, busy, input, onInput, send, onStarted, previousNotes }: Props) {
  const currentInput = useRef(input);
  useEffect(() => { currentInput.current = input; }, [input]);
  async function submit(event?: FormEvent, answer = input, quickReplyId: string | null = null) {
    event?.preventDefault();
    if (!answer.trim() || !state || busy) return;
    const saved = await send({ type: "message", messageId: crypto.randomUUID(), text: answer.trim(), questionId: state.question?.id ?? null, quickReplyId });
    if (saved) { if (currentInput.current === answer) onInput(""); onStarted(); }
  }
  const question = state?.question;
  return <>
    <p className="panel-description">Tell me a little about your restaurant. You can start with anything — your employees, menu, kitchen equipment, or the challenges you&apos;re facing.</p>
    {previousNotes.length > 0 && <details className="legacy-notes"><summary>Previously saved notes</summary><p>Not sent to AI yet. Copy a note below to continue.</p>{previousNotes.map((text, i) => <p key={i}>{text}</p>)}</details>}
    <div className="saved-messages" aria-label="Conversation" aria-busy={busy}>
      {state?.messages.map((message) => <div className={`saved-message ${message.role === "assistant" ? "assistant-message" : ""}`} key={message.id}><span className="eyebrow">{message.role === "user" ? "YOU" : "SHIFTCHEF"}</span><p>{message.text}</p></div>)}
    </div>
    {question && <div className="question-block"><p>{question.text}</p>{question.revisitReason && <p className="muted-copy">{question.revisitReason}</p>}<div className="quick-replies">{question.quickReplies.map((reply) => <button className="secondary-button" key={reply.id} disabled={busy} onClick={() => void submit(undefined, reply.answer, reply.id)}>{reply.label}</button>)}<button className="text-button" disabled={busy} onClick={() => void send({ type: "answer_status", questionId: question.id, status: "unknown" })}>I&apos;m not sure</button>{!question.essential && <button className="text-button" disabled={busy} onClick={() => void send({ type: "answer_status", questionId: question.id, status: "skipped" })}>Skip</button>}</div></div>}
    <form onSubmit={(event) => void submit(event)}><label htmlFor="introduction">Your message</label><textarea id="introduction" rows={4} maxLength={5000} value={input} onChange={(e) => onInput(e.target.value)} placeholder="I run a small restaurant with four cooks…" /><div className="form-bottom"><span className="muted-copy" role="status">{busy ? "Updating your profile…" : ""}</span><button className="primary-button" disabled={!input.trim() || busy || !state}>{busy ? "Sending…" : "Send"}</button></div></form>
  </>;
}
