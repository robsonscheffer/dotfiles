// The mcp-share driver: a JSON-RPC 2.0 POST against a target's `endpoint`, calling its
// tool_create or tool_update tool. Transport is fully injected: no real fetch anywhere, so tests
// (and any manual check) never touch a network.
import type { TargetConfig } from "./adapters.ts";

export interface PublishFetchResponse {
  status: number;
  text(): Promise<string>;
}

// Deliberately narrower than the DOM fetch type, but a bound global `fetch` satisfies it.
export type PublishFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<PublishFetchResponse>;

export interface ShareContent {
  html_content?: string;
  zip_content?: string; // base64
}

export interface ShareCreateArgs extends ShareContent {}
export interface ShareUpdateArgs extends ShareContent {
  slug: string;
  owner_key: string;
}

export interface ShareSuccess {
  isError: false;
  url: string;
  slug: string;
  owner_key: string;
  manage_url?: string;
  version_number?: number;
}
export interface ShareFailure {
  isError: true;
  detail: string;
}
export type ShareResult = ShareSuccess | ShareFailure;

let nextId = 1;

async function callTool(
  fetchImpl: PublishFetch,
  target: TargetConfig,
  tool: string,
  args: Record<string, unknown>,
): Promise<ShareResult> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextId++,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });

  let response: PublishFetchResponse;
  try {
    response = await fetchImpl(target.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch (err) {
    return { isError: true, detail: `request failed: ${(err as Error).message}` };
  }

  const text = await response.text();
  if (response.status !== 200) {
    return { isError: true, detail: `http ${response.status}: ${text}` };
  }

  let envelope: { result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message?: string } };
  try {
    envelope = JSON.parse(text);
  } catch {
    return { isError: true, detail: `non-JSON response: ${text}` };
  }

  if (envelope.error) {
    return { isError: true, detail: envelope.error.message ?? "jsonrpc error" };
  }

  const payloadText = envelope.result?.content?.[0]?.text;
  if (envelope.result?.isError || !payloadText) {
    return { isError: true, detail: payloadText ?? "share tool returned no content" };
  }

  let payload: { url?: string; slug?: string; owner_key?: string; manage_url?: string; version_number?: number };
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return { isError: true, detail: `share tool returned invalid JSON: ${payloadText}` };
  }

  if (!payload.url || !payload.slug || !payload.owner_key) {
    return { isError: true, detail: `share tool response missing url/slug/owner_key: ${payloadText}` };
  }

  return {
    isError: false,
    url: payload.url,
    slug: payload.slug,
    owner_key: payload.owner_key,
    manage_url: payload.manage_url,
    version_number: payload.version_number,
  };
}

export function shareCreate(
  fetchImpl: PublishFetch,
  target: TargetConfig,
  content: ShareContent,
): Promise<ShareResult> {
  return callTool(fetchImpl, target, target.tool_create, content as Record<string, unknown>);
}

export function shareUpdate(
  fetchImpl: PublishFetch,
  target: TargetConfig,
  slug: string,
  ownerKey: string,
  content: ShareContent,
): Promise<ShareResult> {
  return callTool(fetchImpl, target, target.tool_update, {
    ...content,
    slug,
    owner_key: ownerKey,
  } as Record<string, unknown>);
}
