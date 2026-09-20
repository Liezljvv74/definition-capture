"use client";

/**
 * Pick a tense from the remembered ones, or type a new one.
 *
 * Asked in two places — when a table is first made, and when a column is
 * inserted into one — and built twice until now, down to a second copy of the
 * `ANOTHER` sentinel and of the labelling trick below. They are the same
 * question, and a difference between them would only ever be a mistake.
 *
 * The state stays with the caller. Both of them already hold it for their own
 * reasons: the new-table form submits it alongside the verb and the persons,
 * and the insert form clears it on cancel. What is shared here is the part
 * that was actually duplicated — the markup, the sentinel, and the rule about
 * which control carries the label.
 */

/** The dropdown value meaning "none of these, let me type one". */
export const ANOTHER = " another";

/** The tense the controls currently name, or "" when nothing usable is typed. */
export function chosenTense(choice: string, typed: string): string {
  return (choice === ANOTHER ? typed : choice).trim();
}

export function TenseChoice({
  id,
  known,
  choice,
  onChoice,
  typed,
  onTyped,
  placeholder,
  compact = false,
}: {
  /** Belongs to whichever control is actually showing — see below. */
  id: string;
  known: readonly string[];
  choice: string;
  onChoice: (value: string) => void;
  typed: string;
  onTyped: (value: string) => void;
  placeholder: string;
  /** The inline version, for inserting a column into an open table. */
  compact?: boolean;
}) {
  const field = compact ? "field !px-1.5 !py-0.5 text-xs" : "field";
  // With no remembered tenses there is no dropdown, so the label has to point
  // at the text box instead. Only ever one of them carries the id.
  const typing = known.length === 0 || choice === ANOTHER;

  return (
    <>
      {known.length > 0 && (
        <select
          id={id}
          className={compact ? `${field} w-auto` : field}
          value={choice}
          onChange={(event) => onChoice(event.target.value)}
        >
          {known.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={ANOTHER}>Another tense…</option>
        </select>
      )}

      {typing && (
        <input
          id={known.length === 0 ? id : undefined}
          autoFocus
          aria-label="A new tense"
          className={
            compact ? `${field} w-32` : `${field} ${known.length > 0 ? "mt-2" : ""}`
          }
          placeholder={placeholder}
          value={typed}
          onChange={(event) => onTyped(event.target.value)}
        />
      )}
    </>
  );
}
