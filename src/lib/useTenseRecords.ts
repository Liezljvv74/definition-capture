"use client";

import { useEffect, useState } from "react";

import type { TenseRecord } from "@/lib/verbPractice";
import { loadTenseRecords } from "@/lib/verbPracticeData";

/** The account's verb tense records, loaded once per page. */
export function useTenseRecords() {
  const [state, setState] = useState<{ records: TenseRecord[]; loaded: boolean; error: string | null }>({
    records: [],
    loaded: false,
    error: null,
  });

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
  }, []);

  return state;
}
