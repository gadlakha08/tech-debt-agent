import type { Progress } from "../pipeline/progress.js";
import { bold, dim } from "./ui.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR = 20;

const elapsed = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

/**
 * Draws Scan progress on stderr. On a terminal: a spinner line with a counter, bar, elapsed time and the last finished
 * unit, redrawn in place. Piped: one line when a step starts and one when it ends, so logs stay readable.
 */
export function terminalProgress(stream: NodeJS.WriteStream = process.stderr): Progress {
  const live = Boolean(stream.isTTY);
  let step: { title: string; total?: number; count: number; detail?: string; startedAt: number } | undefined;
  let frame = 0;
  let timer: NodeJS.Timeout | undefined;

  const line = () => {
    if (!step) return "";
    const counter = step.total ? ` ${step.count}/${step.total}` : "";
    const time = elapsed(Date.now() - step.startedAt);
    // the detail is cut to fit the terminal width so the line never wraps (a wrapped line can't be redrawn in place)
    const used = 2 + step.title.length + counter.length + (step.total ? BAR + 1 : 0) + 1 + time.length;
    const room = (stream.columns || 80) - used - 4;
    const detail = step.detail && room > 8 ? dim(` · ${step.detail.length > room ? `${step.detail.slice(0, room - 1)}…` : step.detail}`) : "";
    return `${FRAMES[frame % FRAMES.length]} ${step.title}${counter}${step.total ? ` ${bar(step.count, step.total)}` : ""} ${dim(time)}${detail}`;
  };
  const clear = () => live && stream.write("\r\x1b[2K");
  const draw = () => {
    if (!live || !step) return;
    clear();
    stream.write(line());
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    clear();
  };
  const above = (text: string) => {
    clear();
    stream.write(`${text}\n`);
    draw();
  };

  return {
    start(title, total) {
      stop();
      step = { title, total, count: 0, startedAt: Date.now() };
      if (!live) stream.write(`… ${title}${total ? ` (${total})` : ""}\n`);
      else {
        timer = setInterval(() => {
          frame++;
          draw();
        }, 100);
        timer.unref();
        draw();
      }
    },
    tick(detail) {
      if (!step) return;
      step.count++;
      if (detail) step.detail = detail;
    },
    done(summary) {
      if (!step) return;
      stop();
      stream.write(`✔ ${step.title} ${dim("—")} ${summary} ${dim(`(${elapsed(Date.now() - step.startedAt)})`)}\n`);
      step = undefined;
    },
    fail() {
      if (!step) return;
      stop();
      stream.write(`✖ ${step.title} ${dim(`(${elapsed(Date.now() - step.startedAt)})`)}\n`);
      step = undefined;
    },
    warn: (message) => above(`  ! ${message}`),
    log: (text) => above(text),
  };
}

function bar(count: number, total: number): string {
  const filled = Math.round((Math.min(count, total) / total) * BAR);
  return `${bold("━".repeat(filled))}${dim("─".repeat(BAR - filled))}`;
}
