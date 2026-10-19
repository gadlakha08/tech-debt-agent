/** How a Scan reports what it's doing. One step runs at a time; the CLI draws it, other callers can pass `silent`. */
export interface Progress {
  /** Starts a step; total enables an n/total counter. */
  start(title: string, total?: number): void;
  /** One unit of the current step finished; detail names it. */
  tick(detail?: string): void;
  /** Finishes the current step with a one-line result. */
  done(summary: string): void;
  /** Marks the current step failed (the error itself is printed by the caller). */
  fail(): void;
  warn(message: string): void;
  log(line: string): void;
}

/** What a stage needs from Progress: count finished units, report a warning. */
export interface StageHooks {
  tick?: (detail?: string) => void;
  warn?: (message: string) => void;
}

export const silent: Progress = {
  start: () => {},
  tick: () => {},
  done: () => {},
  fail: () => {},
  warn: (m) => console.warn(`! ${m}`),
  log: (l) => console.log(l),
};

export const hooks = (progress: Progress): StageHooks => ({ tick: (d) => progress.tick(d), warn: (m) => progress.warn(m) });
