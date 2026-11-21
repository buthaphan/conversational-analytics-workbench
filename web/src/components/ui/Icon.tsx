import { cn } from "../../lib/cn";

/**
 * Outline icons drawn on a 24px grid with the current text color. Decorative only: every icon sits
 * next to text that carries its meaning, so it is hidden from assistive technology.
 */
const PATHS = {
  barChart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  lineChart: "M4 20h16M4 16l5-5 4 3 7-8",
  pieChart: "M12 3a9 9 0 1 0 9 9h-9z M15 3.5A9 9 0 0 1 20.5 9H15z",
  calendar: "M5 6h14v14H5z M5 10h14 M9 4v4 M15 4v4",
  tag: "M3 12V4h8l9 9-8 8z M7.5 8h.01",
  layers: "M12 4l9 5-9 5-9-5z M3 14l9 5 9-5",
  measure: "M5 20V10 M10 20V4 M15 20v-7 M20 20v-4",
  scale: "M12 4v16 M7 20h10 M4 8h16 M4 8l-2 6h6z M20 8l-2 6h6z",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  group: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01",
  chat: "M4 5h16v11H9l-5 4z",
  sparkle:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  send: "M4 12l16-8-6 16-3-6z M11 14l9-10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("size-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type IconTone = "blue" | "teal" | "gold";

// Full class names are listed so Tailwind can find them in source.
const TILE_TONES: Record<IconTone, string> = {
  blue: "bg-info-subtle text-info",
  teal: "bg-accent-subtle text-accent",
  gold: "bg-highlight-subtle text-highlight",
};

/** An icon in a tinted rounded tile, used beside section titles. */
export function IconTile({
  name,
  tone = "blue",
  className,
}: {
  name: IconName;
  tone?: IconTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg",
        TILE_TONES[tone],
        className,
      )}
    >
      <Icon name={name} className="size-5" />
    </span>
  );
}
