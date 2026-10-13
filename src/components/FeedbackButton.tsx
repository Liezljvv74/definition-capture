"use client";

import { useId, useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

const KINDS = ["Suggestion", "Error"] as const;

/*
 * A twelve-point starburst, like a sticker on the notebook's cover. A
 * five-point star has too little middle to hold a word; this keeps the star
 * and gives "Feedback" room.
 */
const STAR = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 ? 40 : 50;
  const a = (i * Math.PI) / 12 - Math.PI / 2;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
}).join(" ");

/**
 * The yellow star at the top right of every signed-in page, under the nav and
 * in line with the logo in the bottom right corner, which opens the feedback
 * form. `z-40` like the logo: over the page, under a dialog. The form posts
 * to /api/feedback, which emails it to the owner.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group fixed top-16 right-2 z-40 grid size-20 place-items-center text-ink sm:right-4 sm:size-24"
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="col-start-1 row-start-1 size-full rotate-[-8deg] drop-shadow-[2px_3px_0_var(--color-shadow)] transition-transform group-hover:rotate-[4deg] group-hover:scale-105"
        >
          <polygon points={STAR} fill="var(--color-marker)" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <span className="hand-title col-start-1 row-start-1 rotate-[-8deg] text-sm font-bold sm:text-base">Feedback</span>
      </button>
      {open && <FeedbackForm onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const ids = useId();
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"editing" | "sending" | "sent">("editing");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!kind) return setError("Choose Suggestion or Error.");
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter an email address to reply to.");
    if (!details.trim()) return setError("Write a few words about it.");
    setError(null);
    setState("sending");
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name, email, details }),
    }).catch(() => null);
    if (response?.ok) return setState("sent");
    setState("editing");
    setError("Your feedback could not be sent. Try again in a moment.");
  }

  if (state === "sent") {
    return (
      <Modal title="Feedback sent" onClose={onClose}>
        <p>Thank you. Your feedback was sent.</p>
        <div className="flex justify-end pt-4">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Feedback" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium">
            Type <span className="text-red-600 dark:text-red-400">*</span>
          </legend>
          <div className="flex gap-3">
            {KINDS.map((k) => (
              <label
                key={k}
                className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition ${
                  kind === k ? "border-ink bg-marker/30" : "border-rule hover:bg-marker/30"
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-kind`}
                  className="size-4 accent-accent"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                <span className="text-sm font-medium">{k}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-name`} className="mb-1 block text-sm font-medium">
              Name <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id={`${ids}-name`}
              className="field"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-email`} className="mb-1 block text-sm font-medium">
              Email <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id={`${ids}-email`}
              type="email"
              className="field"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${ids}-details`} className="mb-1 block text-sm font-medium">
            Details <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <textarea
            id={`${ids}-details`}
            className="field min-h-32 resize-y"
            maxLength={5000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
