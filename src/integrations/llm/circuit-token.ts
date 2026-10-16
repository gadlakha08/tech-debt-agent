/**
 * OAuth client-credentials token for the CircuIT gateway.
 * POST CIRCUIT_LLM_TOKEN_URL, Basic clientId:clientSecret, grant_type=client_credentials.
 * Cache it and refresh 120 s before expires_in runs out. Never log the token.
 */
export async function getCircuitToken(): Promise<string> {
  throw new Error("not implemented: getCircuitToken (Person A, D1-1)");
}
