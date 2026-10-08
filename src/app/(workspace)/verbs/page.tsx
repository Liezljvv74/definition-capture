"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useState } from "react";

import { EmptyState, ListShell } from "@/components/ListPage";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { VerbTableCard } from "@/components/VerbTableCard";
import { PracticeDialog } from "@/components/verbs/PracticeDialog";
import { MAX_LIST_LENGTH } from "@/lib/constants";
import { saveSettings } from "@/lib/settings";
import { createEntry, findByWord } from "@/lib/storage";
import { EMPTY_ENTRY_INPUT, readNameList } from "@/lib/types";
import { useSettings } from "@/lib/useSettings";
import { useSorting } from "@/lib/useSorting";
import { foldName } from "@/lib/foldName";
import { plural } from "@/lib/home";
import { ANOTHER, chosenTense, TenseChoice } from "@/components/TenseChoice";
import { useTenseRecords } from "@/lib/useTenseRecords";
import { useVerbTables } from "@/lib/useVerbTables";
import { countedTenses } from "@/lib/verbPractice";
import { createVerbTable } from "@/lib/verbTables";

/**
 * The conjugation tables. Each is rolled up to its verb until opened, so the
 * page reads as a list of verbs rather than a wall of conjugations.
 *
 * A table is made with Add verb on this page, or from a word's Edit screen,
 * which sends the reader here with `?new=<verb>`. Either way the tense, and the
 * persons if they have never been given, are asked here, because a question
 * about verbs in general does not belong in a dialog about one word.
 */
export default function VerbsPage() {
  // `useSearchParams` needs a boundary to suspend against during prerender.
  return (
    <Suspense fallback={<VerbsShell />}>
      <VerbList />
    </Suspense>
  );
}

/**
 * The list page's header and column, with what goes in it left to the caller
 * because the shell is also what the loading and Suspense states render, and
 * there is nothing to add to a page that has not arrived yet.
 */
function VerbsShell({
  subtitle = "Loading your verbs…",
  children,
}: {
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <ListShell title="Verbs" marker="section-purple" subtitle={subtitle}>
      {children}
    </ListShell>
  );
}

function VerbList() {
  const params = useSearchParams();
  const { tables, loaded } = useVerbTables();
  const { records, loaded: recordsLoaded, error: recordsError } = useTenseRecords();
  /** True while the Practise dialog is open. */
  const [practising, setPractising] = useState(false);
  const sorting = useSorting();
  const { loaded: settingsLoaded } = useSettings();
  const [query, setQuery] = useState("");
  /** True while a verb is being added from this page rather than a word. */
  const [adding, setAdding] = useState(false);
  /** The one table that is open, if any. Null until anything is opened. */
  const [chosen, setChosen] = useState<string | null>(null);
  /** True once the open table has been edited and not yet saved. */
  const [dirty, setDirty] = useState(false);
  /**
   * Where the reader asked to go while unsaved work stood in the way: a
   * table id, or null for closing outright. Undefined when nothing waits.
   */
  const [waiting, setWaiting] = useState<string | null | undefined>(undefined);
  /**
   * The last `wanted` (below) this page has already acted on, folded the way
   * every name is. Null before anything has arrived. Comparing against a
   * stored value, rather than deriving the open table from the URL afresh on
   * every render, is what tells a genuinely new link apart from the page
   * re-rendering for some other reason (a keystroke in the open card, say),
   * where nothing about where the reader meant to be has changed.
   */
  const [arrivedAt, setArrivedAt] = useState<string | null>(null);
  /**
   * The table a link last named, so it can be rung and scrolled to. Cleared
   * the moment the reader opens or closes anything by hand, which is what
   * stops the ring from following a table the reader has since moved away
   * from under their own steam.
   */
  const [highlightId, setHighlightId] = useState<string | null>(null);

  /** A verb arriving from the Edit word screen, still to be made. */
  const pending = (params.get("new") ?? "").trim();
  /** Either the verb just made, or one a link asked to open. */
  const wanted = foldName(params.get("verb") ?? pending);

  const has = (verb: string) =>
    tables.some((table) => foldName(table.verb) === foldName(verb));

  /** Alphabetical, and narrowed by the search box. */
  const visible = useMemo(() => {
    const needle = foldName(query);
    return tables
      .filter((table) => !needle || foldName(table.verb).includes(needle))
      .sort((a, b) => sorting.compareText(a.verb, b.verb));
  }, [tables, query, sorting]);

  /**
   * A reload or a closed tab loses a draft the same way closing a card
   * does, and the browser is the only thing that can ask about it first.
   */
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);

  /**
   * Opening a card remounts it from what is stored, so whatever was being
   * typed in the one that was open is gone. Once a table has been edited
   * that stops being something to do quietly: the card is asked first.
   */
  function requestOpen(id: string | null) {
    // Only worth asking about while the card that holds the work is on
    // screen to be asked: a search that filters it away, or a table deleted
    // from another device, would otherwise leave the page unable to open
    // anything and nothing visible to say why.
    if (dirty && visible.some((table) => table.id === chosen)) {
      setWaiting(id);
      return;
    }
    setDirty(false);
    setChosen(id);
  }

  /**
   * A link naming a verb is a request to open it, exactly like a click on a
   * card, and has to be asked about the same way: without this, following
   * `[[haben]]` out of a card with unsaved edits would swap the open card out
   * from under the reader with nothing to undo it by, and once any card had
   * ever been opened by hand a link stopped doing anything at all, since App
   * Router does not remount this page for a search-param-only navigation.
   *
   * This runs during render rather than in an effect, adjusting state before
   * the page paints, because all it is doing is keeping `chosen` in step
   * with a prop (`wanted`) that changed: the pattern React's own docs give
   * for exactly this, rather than an effect that would paint the old card
   * for a frame and only then flip to the new one.
   *
   * Skipped while a `?new=` verb has no table yet: `wanted` reads the same
   * folded name before and after `NewTableForm` makes one, and marking it
   * arrived here, while there is nothing to find, would stop the table from
   * being opened once `router.replace` hands the very same name back as
   * `?verb=`.
   */
  if (loaded && wanted !== "" && wanted !== arrivedAt && !(pending !== "" && !has(pending))) {
    setArrivedAt(wanted);
    const target = tables.find((table) => foldName(table.verb) === wanted);
    setHighlightId(target?.id ?? null);
    requestOpen(target?.id ?? null);
  }

  /** Saved, discarded or deleted: nothing is owed, so go where was asked. */
  function settle() {
    setChosen(waiting === undefined ? null : waiting);
    setWaiting(undefined);
    // A link held back by unsaved work is still the reason this table is
    // opening, so it keeps its ring; anything else the reader settled on
    // by hand does not get one.
    if (waiting !== highlightId) setHighlightId(null);
    setDirty(false);
  }

  if (!loaded || !settingsLoaded) return <VerbsShell />;

  // A verb on its way in: from a word, or typed here.
  if (pending !== "" && !has(pending)) {
    return (
      <VerbsShell subtitle="Adding a verb">
        <NewTableForm verb={pending} />
      </VerbsShell>
    );
  }

  if (adding) {
    return (
      <VerbsShell subtitle="Adding a verb">
        <NewTableForm verb="" onCancel={() => setAdding(false)} />
      </VerbsShell>
    );
  }

  if (tables.length === 0) {
    return (
      <VerbsShell subtitle="Your conjugation tables">
        <EmptyState
          doodle="spiral"
          tilt="-0.6deg"
          icon="🧩"
          title="No conjugation tables yet"
          action="+ Add a verb"
          onAction={() => setAdding(true)}
        >
          Tables are made from a word you have already saved. Open a verb on{" "}
          <Link href="/vocabulary" className="text-link underline underline-offset-2">
            Vocabulary
          </Link>
          , choose Edit, and use <strong className="font-semibold">Conjugation table</strong>.
        </EmptyState>
      </VerbsShell>
    );
  }

  return (
    <VerbsShell subtitle={plural(tables.length, "verb", "verbs")}>
      <div className={`${STICKY_FILTERS} mb-3 flex flex-wrap items-center gap-2`}>
        <div className="w-full sm:w-1/2 lg:w-[12.5%] lg:min-w-44">
          <label htmlFor="verb-search" className="sr-only">
            Search verbs
          </label>
          <input
            id="verb-search"
            type="search"
            className="field"
            placeholder="Search verbs…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="flex shrink-0 gap-2 sm:ml-auto">
          {tables.some((table) => countedTenses(table).length > 0) && (
            // Not until the results have loaded, and not if they failed to:
            // either way every tense would look not tried and nothing due.
            <button type="button" className="btn btn-primary" disabled={!recordsLoaded || recordsError !== null} onClick={() => setPractising(true)}>
              Practise
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <span aria-hidden="true">+</span> Add verb
          </button>
        </div>
      </div>

      {recordsError && (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-300">{recordsError}</p>
      )}

      {/* Only while a search is narrowing things down: the total now lives in
          the header, so repeating it here would say the same thing twice. */}
      {visible.length !== tables.length && (
        <p className="mb-2 text-xs text-ink-soft">
          Showing {visible.length} of {tables.length} verbs.
        </p>
      )}

      <div className="space-y-2">
        {visible.map((table) => {
          const isOpen = table.id === chosen;
          return (
            <VerbTableCard
              // Whether it is open is part of the key, so opening a card
              // mounts it fresh from what is stored and closing one throws
              // its draft away, which is why an edited card is asked
              // about before either happens.
              key={`${table.id}:${isOpen}`}
              table={table}
              open={isOpen}
              asking={isOpen && waiting !== undefined}
              highlighted={table.id === highlightId}
              onToggle={() => {
                setHighlightId(null);
                requestOpen(isOpen ? null : table.id);
              }}
              onEdited={() => setDirty(true)}
              onKeep={() => setWaiting(undefined)}
              onFinish={settle}
              // No marks at all rather than every tense marked not tried.
              records={recordsError ? undefined : records}
            />
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="py-6 text-sm text-ink-soft">
          No verb matches “{query.trim()}”.{" "}
          <button
            type="button"
            className="cursor-pointer text-link underline underline-offset-2"
            onClick={() => setQuery("")}
          >
            Clear the search
          </button>
        </p>
      )}

      {practising && (
        <PracticeDialog tables={tables} records={records} onClose={() => setPractising(false)} />
      )}
    </VerbsShell>
  );
}

/**
 * Everything a new table needs, asked in one place: the tense always, and
 * the persons the first time. Both answers are kept, so the second table is
 * a dropdown and the third is barely a pause.
 */
function NewTableForm({ verb, onCancel }: { verb: string; onCancel?: () => void }) {
  const router = useRouter();
  const ids = useId();
  const { settings } = useSettings();
  const { tables } = useVerbTables();

  /** Empty when the verb is being typed here rather than opened from a word. */
  const [typedVerb, setTypedVerb] = useState("");
  const name = (verb || typedVerb).trim();
  const asksForVerb = verb === "";
  const alreadyHasTable = tables.some(
    (table) => foldName(table.verb) === foldName(name),
  );

  const knownTenses = settings.verbTenses;
  const needsPersons = settings.verbPersons.length === 0;

  const [choice, setChoice] = useState(knownTenses[0] ?? ANOTHER);
  const [typedTense, setTypedTense] = useState("");
  const [typedPersons, setTypedPersons] = useState("");

  const tense = chosenTense(choice, typedTense);
  const persons = needsPersons
    ? readNameList(typedPersons.split("\n"), MAX_LIST_LENGTH)
    : settings.verbPersons;
  const ready = name !== "" && !alreadyHasTable && tense !== "" && persons.length > 0;

  function make() {
    if (!ready) return;

    // A tense typed once is offered from then on. One already on the list
    // stays where it is: the order is the reader's.
    const known = knownTenses.some(
      (candidate) => foldName(candidate) === foldName(tense),
    );
    const tenses = known ? knownTenses : [...knownTenses, tense];

    saveSettings(
      needsPersons ? { verbTenses: tenses, verbPersons: persons } : { verbTenses: tenses },
    );

    // A verb typed here may not be in the word list at all. Add it, empty,
    // rather than leaving a conjugation table for a word the glossary has
    // never heard of; the two are matched by name, and a table with no
    // word behind it is a dead end. A verb that is already there is left
    // exactly as it is.
    if (!findByWord(name)) createEntry({ ...EMPTY_ENTRY_INPUT, word: name });

    createVerbTable(name, persons, tense);
    // The address should describe what is on screen, not the act that got
    // there, so a reload opens the table rather than offering to make it.
    router.replace(`/verbs?verb=${encodeURIComponent(name)}`);
  }

  return (
    <div className="card tape relative mx-auto max-w-md p-5">
      <h2 className="hand-title text-lg">
        {asksForVerb ? "A conjugation table for a new verb" : `A conjugation table for ${verb}`}
      </h2>

      {asksForVerb && (
        <div className="mt-4">
          <label htmlFor={`${ids}-verb`} className="mb-1 block text-sm font-medium">
            Which verb?
          </label>
          <input
            id={`${ids}-verb`}
            autoFocus
            className="field"
            placeholder="e.g. lernen"
            value={typedVerb}
            onChange={(event) => setTypedVerb(event.target.value)}
          />
          <p className="mt-1 text-xs text-ink-soft">
            {alreadyHasTable
              ? `${name} already has a table.`
              : "Added to Vocabulary as well, if it is not saved there already."}
          </p>
        </div>
      )}

      <div className="mt-4">
        <label htmlFor={`${ids}-tense`} className="mb-1 block text-sm font-medium">
          Which tense is it for?
        </label>

        <TenseChoice
          id={`${ids}-tense`}
          known={knownTenses}
          choice={choice}
          onChoice={setChoice}
          typed={typedTense}
          onTyped={setTypedTense}
          placeholder="e.g. Present"
        />

        <p className="mt-1 text-xs text-ink-soft">
          Kept for next time, so you pick it from a list rather than typing it
          again.
        </p>
      </div>

      {needsPersons && (
        <div className="mt-4">
          <label htmlFor={`${ids}-persons`} className="mb-1 block text-sm font-medium">
            Who does a verb conjugate for?
          </label>
          <textarea
            id={`${ids}-persons`}
            rows={6}
            className="field resize-y font-mono text-sm"
            placeholder={"ich\ndu\ner/sie/es\nwir\nihr\nSie/sie"}
            value={typedPersons}
            onChange={(event) => setTypedPersons(event.target.value)}
          />
          <p className="mt-1 text-xs text-ink-soft">
            One per line, in the order the rows should appear. Asked once and
            used for every table after this; editable later under Settings.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={make}>
          Make the table
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <Link href="/vocabulary" className="btn btn-secondary">
            Cancel
          </Link>
        )}
      </div>
    </div>
  );
}
