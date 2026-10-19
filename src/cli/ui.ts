import { styleText } from "node:util";

/** Colour on a real terminal unless NO_COLOR is set; FORCE_COLOR (not "0") turns it on anywhere. */
const force = process.env.FORCE_COLOR;
const color = force ? force !== "0" : Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const style = (format: Parameters<typeof styleText>[0], text: string) => (color ? styleText(format, text, { validateStream: false }) : text);

export const bold = (text: string) => style("bold", text);
export const dim = (text: string) => style("dim", text);
export const heading = (text: string) => `\n${style(["bold", "cyan"], text)}`;

/** Aligned `label  value` rows. */
export function rows(entries: [label: string, value: string][]): string[] {
  const width = Math.max(...entries.map(([label]) => label.length));
  return entries.map(([label, value]) => `  ${dim(label.padEnd(width))}  ${value}`);
}
