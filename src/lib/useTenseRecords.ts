"use client";

import { useCallback, useEffect, useState } from "react";

import type { TenseRecord } from "@/lib/verbPractice";
import { loadTenseRecords } from "@/lib/verbPracticeData";

/** The account's verb tense records, loaded once per page and on `reload`. */
export function useTenseRecords() {
  const [state, setState] = useState<{ records: TenseRecord[]; loaded: boolean; error: string | null }>({
    records: [],
    loaded: false,
    error: null,
  });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    loadTenseRecords().then(
      (records) => live && setState({ records, loaded: true, error: null }),
      (cause: unknown) =>
        live && setState({ records: [], loaded: true, error: cause instanceof Error ? cause.message : String(cause) }),
    );
    return () => {
      live = false;
    };
  }, [round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { ...state, reload };
}
