import { openSync } from "node:fs";
import { ReadStream, WriteStream } from "node:tty";
import { confirm as inquirerConfirm, input, select } from "@inquirer/prompts";

export interface AskOptions {
  default?: string;
  validate?: (value: string) => true | string;
  /** How the typed value is shown; isFinal is true once the answer is submitted. */
  transformer?: (value: string, state: { isFinal: boolean }) => string;
}
export type Ask = (question: string, opts?: AskOptions) => Promise<string>;
export interface Choice<T extends string> {
  name: string;
  value: T;
  description?: string;
}
export type Choose = <T extends string>(question: string, choices: Choice<T>[], fallback?: T) => Promise<T>;
export type Confirm = (question: string, fallback: boolean) => Promise<boolean>;
export type PreflightChoice = "recheck" | "fallback" | "quit";

/** Runs one prompt on stdin/stdout, or on /dev/tty when stdin is piped or redirected. */
async function onTerminal<T>(prompt: (context: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream }) => Promise<T>): Promise<T> {
  if (process.stdin.isTTY) return cancelled(() => prompt({}));
  let tty: { input: ReadStream; output: WriteStream };
  try {
    tty = { input: new ReadStream(openSync("/dev/tty", "r")), output: new WriteStream(openSync("/dev/tty", "w")) };
  } catch {
    throw new Error("preflight is interactive: run dd from a terminal (headless mode is post-hackathon)");
  }
  try {
    return await cancelled(() => prompt(tty));
  } finally {
    tty.input.destroy();
    tty.output.destroy();
  }
}

/** Ctrl-C / Ctrl-D in a prompt ends the command with a short message instead of inquirer's error. */
async function cancelled<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.name === "ExitPromptError") throw new Error("cancelled at the prompt");
    throw err;
  }
}

/** A text answer; validate returns true or the message shown under the prompt. */
export const ask: Ask = (question, opts = {}) =>
  onTerminal((context) => input({ message: question, default: opts.default, validate: opts.validate, transformer: opts.transformer }, context)).then((a) => a.trim());

/** One of a fixed list, picked with the arrow keys. */
export const choose: Choose = (question, choices, fallback) => onTerminal((context) => select({ message: question, choices, default: fallback }, context));

export const confirm: Confirm = (question, fallback) => onTerminal((context) => inquirerConfirm({ message: question, default: fallback }, context));

/** Re-check / use the fallback / quit. Blocking gaps offer only re-check and quit. */
export function askChoice(blocking: boolean): Promise<PreflightChoice> {
  const choices = [
    { name: "Re-check", value: "recheck" as const },
    ...(blocking ? [] : [{ name: "Use the fallback", value: "fallback" as const }]),
    { name: "Quit", value: "quit" as const },
  ];
  return onTerminal((context) => select({ message: "Preflight", choices }, context));
}
