/**
 * KLAIM MCP endpoint (Streamable HTTP, JSON-RPC 2.0).
 *
 *   POST https://<app>/api/public/mcp
 *   X-KLAIM-Agent-Id: agent_...
 *   Authorization: Bearer klm_...
 *
 * Lives under /api/public/* so external MCP clients (Claude, Cursor, custom
 * agents) can reach it without site auth; the handler authenticates
 * every caller with the verifier's KLAIM agent access key.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  MCP_PROTOCOL_VERSION,
  authenticateMcpRequest,
  handleRpc,
  type JsonRpcRequest,
  type McpTool,
} from "@/lib/klaim/server/mcp.server";
import { handleVerifyAge } from "../v1/verify/age";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KLAIM-Agent-Id, X-PAYMENT, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version",
};

async function POST({ request }: { request: Request }): Promise<Response> {
  const { agent, error } = await authenticateMcpRequest(request);
  if (!agent) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: error ?? "Unauthorized" } },
      { status: 401, headers: CORS },
    );
  }

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS },
    );
  }

  // The MCP layer holds no payment or ZK logic: it forwards to the
  // x402-protected Verification API and relays whatever that returns.
  const callTool = async (tool: McpTool, args: Record<string, unknown>) => {
    const apiRequest = new Request(new URL(tool.endpoint, request.url).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KLAIM-Agent-Id": request.headers.get("X-KLAIM-Agent-Id") ?? "",
        Authorization: request.headers.get("Authorization") ?? "",
        ...(request.headers.get("X-PAYMENT") ? { "X-PAYMENT": request.headers.get("X-PAYMENT")! } : {}),
      },
      body: JSON.stringify(args),
    });
    const res = await handleVerifyAge(apiRequest);
    const json = (await res.json()) as Record<string, unknown>;
    if (res.status === 402) {
      return {
        isError: true,
        content:
          "Payment required. This verification is billed per request via x402 on Algorand Testnet. Retry with an X-PAYMENT payload that satisfies the returned requirements.",
        structured: json,
      };
    }
    if (!res.ok) {
      return { isError: true, content: `KLAIM verification failed: ${String(json['message'] ?? json['error'])}`, structured: json };
    }
    return {
      isError: false,
      content: `${json['claim']} = ${String(json['verified'])}. No date of birth, Aadhaar, PAN, address or document was disclosed.`,
      structured: json,
    };
  };

  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = (await Promise.all(messages.map((m) => handleRpc(m, { agent, callTool })))).filter(Boolean);

  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS });

  return Response.json(Array.isArray(payload) ? responses : responses[0], {
    headers: { ...CORS, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION },
  });
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      POST,
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        Response.json(
          { error: "method_not_allowed", message: "KLAIM MCP uses JSON-RPC over POST." },
          { status: 405, headers: CORS },
        ),
    },
  },
});
