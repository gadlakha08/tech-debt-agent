/**
 * OAuth client-credentials token for the CircuIT gateway.
 * POST CIRCUIT_LLM_TOKEN_URL, Basic clientId:clientSecret, grant_type=client_credentials.
 * Cache it and refresh 120 s before expires_in runs out. Never log the token.
 */
interface CachedToken {
  value: string;
  refreshAt: number;
}

let cachedToken: CachedToken | undefined;

export async function getCircuitToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.refreshAt) return cachedToken.value;

  const tokenUrl = requiredEnv("CIRCUIT_LLM_TOKEN_URL");
  const clientId = requiredEnv("CIRCUIT_LLM_CLIENT_ID");
  const clientSecret = requiredEnv("CIRCUIT_LLM_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`CircuIT token request failed (${response.status} ${response.statusText}). Check the token URL and client credentials.`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("CircuIT token response was not an object.");
  const token = (payload as { access_token?: unknown }).access_token;
  const expiresIn = (payload as { expires_in?: unknown }).expires_in;
  if (typeof token !== "string" || token.length === 0) throw new Error("CircuIT token response did not contain access_token.");
  const lifetimeSeconds = typeof expiresIn === "number" && Number.isFinite(expiresIn) ? expiresIn : 3600;
  const refreshLeadMs = Math.min(120_000, Math.max(0, lifetimeSeconds * 1000 / 2));
  cachedToken = { value: token, refreshAt: Date.now() + Math.max(1_000, lifetimeSeconds * 1000 - refreshLeadMs) };
  return token;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}
