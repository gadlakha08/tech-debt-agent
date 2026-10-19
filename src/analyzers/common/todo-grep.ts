import type { Analyzer } from "../context.js";
import { isMainCode, lineScan } from "./files.js";

const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;

/** TODO/FIXME/HACK/XXX markers in shipped code, one bundle per file. */
export const todoGrep: Analyzer = (ctx) =>
  lineScan(
    ctx,
    ctx.files.filter((f) => isMainCode(f, ctx.stack)),
    { category: "code", rule: "todo-comments", min: ctx.thresholds.code.todoMinPerFile },
    (l) => (MARKER.test(l) ? l : undefined),
  );
