"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmDeleteDialog } from "@/components/DeleteControls";
import { SEARCH_MIN, type SearchResult } from "@/lib/tutor";
import { deleteConversation, renameConversation } from "@/lib/tutorConversations";

type Conversation = { id: string; name: string };

const ERROR = "text-sm text-red-600 dark:text-red-400";
const SAVE_FAILED = "Could not save to the database. The list has been reloaded.";
const SEARCH_FAILED = "Search is not available right now.";
const SEARCH_LIMITED = "Too many searches in the last hour. Try again later.";

/**
 * The saved conversations, newest activity first, one line each, under a
 * search that looks only through conversations. On phones the whole of it
 * opens as a panel over the page from a Conversations button. Renames and
 * deletes are written straight away; a failure reloads the list from the
 * server and says so here.
 */
export function TutorSidebar({ conversations, activeId }: { conversations: Conversation[]; activeId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(conversations);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  // Set by Escape just before the box loses focus, so leaving it that way cancels instead of saving.
  const cancelRename = useRef(false);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);

  // The server's list wins whenever it changes (a new conversation, a reload after a failure).
  // Adjusted during render, not in an effect, which would render the stale list first.
  const [seen, setSeen] = useState(conversations);
  if (seen !== conversations) {
    setSeen(conversations);
    setList(conversations);
  }

  // Searches a moment after typing stops; an answer to an older query is ignored.
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/tutor/search/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const body = await response.json().catch(() => ({}));
        if (!current) return;
        if (response.status === 401) return router.push("/");
        setSearchError(response.ok ? null : response.status === 429 ? SEARCH_LIMITED : SEARCH_FAILED);
        setResults(response.ok ? body.results ?? [] : null);
      } catch {
        if (!current) return;
        setSearchError(SEARCH_FAILED);
        setResults(null);
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, router]);

  async function rename(conversation: Conversation, name: string) {
    setRenaming(null);
    if (name.trim() === conversation.name || !name.trim()) return;
    setList((all) => all.map((c) => (c.id === conversation.id ? { ...c, name: name.trim() } : c)));
    const ok = await renameConversation(conversation.id, name);
    setWriteFailed(!ok);
    router.refresh();
  }

  async function remove(conversation: Conversation) {
    setDeleting(null);
    setList((all) => all.filter((c) => c.id !== conversation.id));
    const ok = await deleteConversation(conversation.id);
    setWriteFailed(!ok);
    if (ok && conversation.id === activeId) router.push("/tutor");
    else router.refresh();
  }

  // The panel is always in the page, so autoFocus would only fire on first render; focus when it opens instead.
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) searchBox.current?.focus();
  }, [open]);

  const close = () => setOpen(false);
  // Results and their error are kept only while the query is long enough to search.
  const searching = query.trim().length >= SEARCH_MIN;
  const shownResults = searching ? results : null;

  return (
    <>
      {/* The margins line the button up with the chat, whose notebook-page padding is wider than the page's own. */}
      <button type="button" className="btn btn-secondary mt-4 ml-12 self-start md:ml-[104px] lg:hidden" aria-expanded={open} aria-controls="tutor-conversations" onClick={() => setOpen(true)}>
        Conversations
      </button>
      <aside
        id="tutor-conversations"
        aria-label="Conversations"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) close();
        }}
        className={`${open ? "fixed inset-0 z-40 block overflow-y-auto bg-[var(--color-paper)] p-4" : "hidden"} lg:sticky lg:top-[var(--nav-height)] lg:block lg:max-h-[calc(100vh-var(--nav-height))] lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:py-8`}
      >
        <div className="space-y-3">
          {open && (
            <button type="button" className="btn btn-secondary lg:hidden" onClick={close}>Close</button>
          )}
          <div>
            <label htmlFor="tutor-search" className="sr-only">Search conversations</label>
            <input
              ref={searchBox}
              id="tutor-search"
              type="search"
              className="field"
              placeholder="Search conversations"
              value={query}
              maxLength={200}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {searching && searchError && <p role="alert" className={ERROR}>{searchError}</p>}
          {writeFailed && <p role="alert" className={ERROR}>{SAVE_FAILED}</p>}

          {shownResults ? (
            shownResults.length === 0 ? (
              <p className="text-sm text-ink-soft">No conversations match.</p>
            ) : (
              <ul className="space-y-2">
                {shownResults.map((result) => (
                  <li key={result.conversationId}>
                    <Link href={`/tutor?c=${result.conversationId}#e-${result.exchangeId}`} className="block rounded px-2 py-1 hover:bg-[var(--color-tile-sky)]" onClick={close}>
                      <span className="block truncate text-sm font-medium">{result.name}</span>
                      <span className="block truncate text-xs text-ink-soft">{result.snippet}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : list.length === 0 ? (
            <p className="text-sm text-ink-soft">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {list.map((conversation) => (
                <li key={conversation.id} className="flex items-center gap-1">
                  {renaming?.id === conversation.id ? (
                    <input
                      aria-label="Name"
                      className="field min-w-0 flex-1 py-0.5 text-sm"
                      defaultValue={conversation.name}
                      maxLength={120}
                      autoFocus
                      // Leaving the box saves, as clicking away is how people finish
                      // typing (the owner found Enter-only lost a rename, 7 October
                      // 2026). Enter saves by leaving the box, so the save happens
                      // once, in onBlur; Escape cancels.
                      onBlur={(event) => {
                        if (cancelRename.current) {
                          cancelRename.current = false;
                          setRenaming(null);
                        } else void rename(conversation, event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          // Only the rename is cancelled, not the phone panel around it.
                          event.stopPropagation();
                          cancelRename.current = true;
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <Link
                      href={`/tutor?c=${conversation.id}`}
                      aria-current={conversation.id === activeId ? "page" : undefined}
                      title={conversation.name}
                      className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-sm ${conversation.id === activeId ? "bg-[var(--color-tile-sky)] font-medium" : "hover:bg-[var(--color-tile-sky)]"}`}
                      onClick={close}
                    >
                      {conversation.name}
                    </Link>
                  )}
                  <details className="relative">
                    <summary aria-label={`Actions for ${conversation.name}`} className="cursor-pointer list-none rounded px-1.5 text-sm">⋯</summary>
                    <div className="absolute right-0 z-10 mt-1 flex flex-col rounded border-[1.5px] border-ink bg-[var(--color-paper)] p-1 text-sm shadow-[2px_3px_0_var(--color-shadow)]">
                      <button type="button" className="px-2 py-1 text-left" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setRenaming(conversation); }}>Rename</button>
                      <button type="button" className="px-2 py-1 text-left" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDeleting(conversation); }}>Delete</button>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {deleting && (
        <ConfirmDeleteDialog
          names={[deleting.name]}
          noun="conversation"
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
