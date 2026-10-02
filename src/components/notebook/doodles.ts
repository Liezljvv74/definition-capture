/**
 * Doodles that draw themselves on the page at good moments, then fade and are
 * removed: the mock-up's doodle system, as one helper any client component can
 * call. Each is a small inline SVG path drawn with a stroke-dashoffset
 * animation (pathLength 1), in a layer over the document that takes no clicks
 * and is hidden from screen readers. Under reduced motion a doodle appears
 * already drawn (notebook.css), and idle doodles do not run at all.
 */

export const DOODLES = {
  star: "M50 6 L61 37 L94 39 L68 60 L77 93 L50 75 L23 93 L32 60 L6 39 L39 37 Z",
  heart: "M50 88 C8 56 14 18 38 18 C46 18 50 26 50 32 C50 26 54 18 62 18 C86 18 92 56 50 88 Z",
  check: "M8 52 L38 82 L94 16",
  spiral: "M50 50 C55 40 65 45 62 55 C58 68 40 66 38 52 C36 36 56 28 68 38 C82 52 70 76 50 76",
  sparkle: "M50 6 L50 94 M6 50 L94 50 M20 20 L80 80 M80 20 L20 80",
  squiggle: "M4 50 Q 18 14 32 50 T 60 50 T 96 50",
  arrow: "M4 60 Q 40 20 86 48 M66 28 L90 50 L62 62",
  loop: "M10 70 C 30 10 80 10 70 50 C 60 80 25 60 45 35 C 60 20 90 40 92 70",
} as const;

export type DoodleShape = keyof typeof DOODLES;

/** The notebook's pens: indigo, margin red, green, gold, ink. */
const PENS = ["#4b35e8", "#e8868b", "#2f9e63", "#e0a800", "#1d2742"];

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The one layer every doodle is drawn into, spanning the whole document. */
function layer(): HTMLElement {
  let found = document.getElementById("doodle-layer");
  if (!found) {
    found = document.createElement("div");
    found.id = "doodle-layer";
    found.className = "doodle-layer";
    found.setAttribute("aria-hidden", "true");
    document.body.style.position ||= "relative";
    document.body.appendChild(found);
  }
  return found;
}

/**
 * Draws one doodle centred on a point in document coordinates, then fades and
 * removes it after `life` milliseconds.
 */
export function drawDoodle(
  shape: DoodleShape,
  x: number,
  y: number,
  { size = 48, colour, life = 2200 }: { size?: number; colour?: string; life?: number } = {},
): void {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "doodle");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = svg.style.height = `${size}px`;
  svg.style.left = `${x - size / 2}px`;
  svg.style.top = `${y - size / 2}px`;
  svg.style.transform = `rotate(${Math.random() * 30 - 15}deg)`;
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", DOODLES[shape]);
  path.setAttribute("pathLength", "1");
  path.style.stroke = colour ?? PENS[Math.floor(Math.random() * PENS.length)];
  svg.appendChild(path);
  layer().appendChild(svg);
  window.setTimeout(() => svg.classList.add("fade"), life);
  window.setTimeout(() => svg.remove(), life + 900);
}

/** An element's box in document coordinates. */
export function docBox(element: Element) {
  const r = element.getBoundingClientRect();
  return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
}

/**
 * The flashcard celebration: a check mark on the card and a star, a heart and
 * sparkles round its edges, clear of the text in the middle.
 */
export function celebrate(card: Element): void {
  const b = docBox(card);
  const life = 2600;
  drawDoodle("check", b.left + b.width - 30, b.top + b.height / 2, { size: 70, colour: "#2f9e63", life });
  drawDoodle("star", b.left + b.width - 8, b.top - 8, { size: 52, colour: "#e0a800", life });
  drawDoodle("sparkle", b.left + 6, b.top - 8, { size: 32, colour: "#e8868b", life });
  drawDoodle("heart", b.left + b.width * 0.3, b.top + b.height + 14, { size: 36, colour: "#e8868b", life });
  drawDoodle("sparkle", b.left + b.width + 8, b.top + b.height * 0.75, { size: 26, colour: "#4b35e8", life });
}
