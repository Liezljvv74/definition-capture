"use client";

import { useEffect } from "react";

import { handleEnter } from "@/lib/enterMovesDown";

/** Mounted once in the root layout, so the Enter rule holds on every page. See `enterMovesDown.ts`. */
export function EnterMovesDown() {
  useEffect(() => {
    document.addEventListener("keydown", handleEnter);
    return () => document.removeEventListener("keydown", handleEnter);
  }, []);
  return null;
}
