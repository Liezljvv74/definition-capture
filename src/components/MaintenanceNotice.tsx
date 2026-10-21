/**
 * Whether the Supabase project is paused, which takes sign-in and sign-up down
 * with it. While it is, both pages show `MaintenanceNotice` in place of their
 * forms, so a visitor reads why instead of a form that fails on submit.
 *
 * A constant rather than an environment variable: a `NEXT_PUBLIC_` value is
 * compiled in at build time, so switching it in Vercel needs a redeploy anyway,
 * and a push to `main` is one step where the dashboard and a redeploy are two.
 * Set it back to `false` in the same push that follows restoring the project.
 */
export const MAINTENANCE = true;

/** Ink, not red: red is kept for errors, and this is a notice. */
export function MaintenanceNotice() {
  return (
    <div role="status" className="mt-3 space-y-3 text-sm">
      <KidsDrawing />
      <p>The website is undergoing maintenance.</p>
      <p className="text-ink-soft">
        Signing in and creating an account are unavailable until it is finished. Your words,
        phrases and notes are kept safe in the meantime. Please try again later.
      </p>
    </div>
  );
}

/**
 * A child's crayon picture of somebody fixing the house, drawn in the
 * notebook's pens (doodles.ts) minus the margin red, which is kept for
 * warnings. `--nb-link` rather than the indigo hex so it stays readable on the
 * dark card. Decorative, so hidden from screen readers.
 */
function KidsDrawing() {
  const ink = "var(--nb-ink)";
  const indigo = "var(--nb-link)";
  const green = "#2f9e63";
  const gold = "#e0a800";
  return (
    <svg
      viewBox="0 0 240 150"
      className="mx-auto block w-full max-w-60"
      aria-hidden="true"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Sun, slightly lopsided as a child would draw it. */}
      <path d="M205 15 C220 14 222 40 206 42 C190 43 189 16 205 15 Z" stroke={gold} />
      <path d="M205 4 L205 9 M224 12 L220 16 M232 29 L226 29 M224 46 L220 42 M205 54 L205 49 M188 45 L192 41 M180 29 L186 29 M187 12 L191 16" stroke={gold} />
      {/* Cloud. */}
      <path d="M110 34 C104 24 116 16 122 22 C126 12 142 14 142 24 C152 22 154 36 144 38 L114 39 C106 39 104 35 110 34 Z" stroke="var(--nb-ink-soft)" />
      {/* House. */}
      <path d="M30 140 L32 86 L92 84 L94 140" stroke={indigo} />
      <path d="M24 89 L62 52 L101 87" stroke={indigo} />
      <path d="M54 140 L55 112 L70 111 L71 140" stroke={indigo} />
      <path d="M76 97 L88 96 L88 107 L77 108 Z M82 96 L82 108 M76 102 L88 102" stroke={indigo} />
      {/* The kid with a hammer. */}
      <path d="M150 66 C163 66 163 89 150 89 C137 89 137 66 150 66 Z" stroke={ink} />
      <path d="M145 76 L145 76.5 M155 76 L155 76.5" stroke={ink} strokeWidth={4} />
      <path d="M144 81 Q150 87 156 81" stroke={ink} />
      <path d="M150 89 L150 118 M150 118 L140 138 M150 118 L161 138 M150 98 L136 107 M150 98 L170 90" stroke={ink} />
      <path d="M170 90 L181 73" stroke={gold} strokeWidth={4} />
      <path d="M174 68 L190 78" stroke={ink} strokeWidth={6} />
      {/* Grass. */}
      <path d="M4 141 Q 20 133 35 141 T 65 141 T 95 141 T 125 141 T 155 141 T 185 141 T 215 141 T 236 139" stroke={green} />
    </svg>
  );
}
