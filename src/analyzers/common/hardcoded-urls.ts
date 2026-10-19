import type { Analyzer } from "../context.js";
import { CONFIG_EXTS, isMainCode, isTestFile, isTooling, lineScan } from "./files.js";

const URL = /\bhttps?:\/\/[^\s"'`<>)\]]+|\blocalhost(?::\d+)?\b|\b127\.0\.0\.1\b/g;
// namespaces, licences and docs links are not configuration
const BENIGN = /xmlns|w3\.org|apache\.org\/licenses|apache\.org\/xml|example\.(com|org)|json-schema\.org|springframework\.org\/schema|maven\.apache\.org|schemas\.|opensource\.org|github\.com|swagger\.io/i;
const COMMENT = /^\s*(\/\/|\/\*|\*|#|<!--)/;
const URL_CREDENTIALS = /(\bhttps?:\/\/)[^/\s:@]+:[^/\s@]+@/gi;

/** http(s)/localhost literals in shipped code (config files are where URLs belong, so they are skipped). */
export const hardcodedUrls: Analyzer = async (ctx) => {
  if (!ctx.thresholds.ops.hardcodedUrls) return [];
  return lineScan(ctx, ctx.files.filter((f) => isMainCode(f, ctx.stack)), { category: "ops", rule: "hardcoded-url" }, (l) => {
    if (COMMENT.test(l)) return undefined;
    if (![...l.matchAll(URL)].some((m) => !BENIGN.test(m[0]))) return undefined;
    // the line goes into prompts and Jira: drop user:pass@ and any secret-shaped value first
    const line = l.replace(URL_CREDENTIALS, "$1<redacted>@");
    return redact(line, true) ?? line;
  });
};

const SECRET_NAME = String.raw`[\w.-]*(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|private[_-]?key|token|credentials?)[\w.-]*`;
// NAME = "value" in code, NAME: value / NAME=value in config; placeholders like ${X} or <X> are fine
const ASSIGNED = new RegExp(String.raw`(${SECRET_NAME}["']?\s*[:=]\s*)(["']?)([^"'\s,;{}<>$]{6,})\2`, "gi");
const RAW = [/AKIA[0-9A-Z]{16}/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g];
const NOT_A_VALUE = /^(true|false|null|none|required|optional|string|password|secret|changeme|change-me|admin|test|dummy|example|x{3,}|\*+|\d+)$/i;
// TOKEN_HEADER = "Authorization", PASSWORD_PARAM = "pwd": names of things, not secrets
const NAME_OF_THING = /(header|param|field|property|path|url|uri|prefix|suffix|name|type|regex|pattern|endpoint|label|message|msg|attribute|attr)["']?$/i;
// "APP_TOKEN_KEY" (an env/config key name), "spring.x.password" (a property key), "getToken(" (a call)
const KEY_NAME_VALUE = /^[A-Z][A-Z0-9_]*$|^[\w-]+(\.[\w-]+)+$|\(/;

/** The line with every secret value replaced by <redacted>, or undefined when nothing secret-shaped is on it. */
function redact(line: string, quotedOnly: boolean): string | undefined {
  let out = line;
  let found = false;
  for (const re of RAW) {
    const next = out.replace(re, "<redacted>");
    if (next !== out) (out = next), (found = true);
  }
  // match on the RAW-redacted text, right to left so earlier indexes stay valid
  for (const m of [...out.matchAll(ASSIGNED)].reverse()) {
    const [, name = "", quote = "", value = ""] = m;
    if (quotedOnly && !quote) continue;
    if (NOT_A_VALUE.test(value) || KEY_NAME_VALUE.test(value) || NAME_OF_THING.test(name.replace(/[\s:="']+$/, ""))) continue;
    const at = m.index + name.length + quote.length;
    out = out.slice(0, at) + "<redacted>" + out.slice(at + value.length);
    found = true;
  }
  return found ? out : undefined;
}

/** Secret-shaped literals in code and config. The value never leaves this function; Part 1 classifies them as Defects. */
export const secretLiterals: Analyzer = async (ctx) => {
  if (!ctx.thresholds.ops.secretLiterals) return [];
  const candidates = ctx.files.filter(
    (f) => (isMainCode(f, ctx.stack) || (CONFIG_EXTS.test(f) && !isTestFile(f) && !isTooling(f))) && !/(package-lock|yarn\.lock|pnpm-lock)/.test(f),
  );
  return lineScan(ctx, candidates, { category: "ops", rule: "secret-literal" }, (l, file) =>
    l.length < 2000 ? redact(l, isMainCode(file, ctx.stack)) : undefined,
  );
};
