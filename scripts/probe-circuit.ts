// Probes whether the CircuIT gateway accepts response_format json_schema for gpt-5-nano.
// Run: npx tsx scripts/probe-circuit.ts   (needs CIRCUIT_LLM_* in the environment; never prints the token)
import { chat } from "../src/integrations/llm/circuit-client.js";
import { UsageMeter } from "../src/integrations/llm/usage.js";

const usage = new UsageMeter();
try {
  const res = await chat(
    {
      stage: "probe",
      messages: [{ role: "user", content: 'Return {"ok": true}' }],
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "probe", strict: true, schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } },
      },
    },
    usage,
  );
  console.log("json_schema accepted:", res.message.content);
} catch (err) {
  console.log("json_schema rejected or client not implemented:", (err as Error).message);
}
