import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { colors, themeVariables } from "../design/tokens";

const textSizes = Object.keys(themeVariables)
  .filter((name) => name.startsWith("text-") && !name.includes("--"))
  .map((name) => name.slice("text-".length));

/** tailwind-merge that knows the project's token names (see styles/tokens.css). */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: Object.keys(colors),
      text: textSizes,
    },
  },
});

/** Combines class names; later Tailwind classes override conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
