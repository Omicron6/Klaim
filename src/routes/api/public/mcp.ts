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
import { payerConfigured, missingPayerEnv, signPaymentFromResponse } from "@/lib/klaim/server/x402-client.server";

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

  // The MCP layer forwards to the x402-protected Verification API.
  // If a 402 is returned and payer config exists, it signs and retries server-side.
  const callTool = async (tool: McpTool, args: Record<string, unknown>) => {
    console.log("[KLAIM MCP] verify_human_age requested");

    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-KLAIM-Agent-Id": request.headers.get("X-KLAIM-Agent-Id") ?? "",
      Authorization: request.headers.get("Authorization") ?? "",
    };

    // If the incoming MCP request already carries X-PAYMENT (external wallet), forward it
    if (request.headers.get("X-PAYMENT")) {
      baseHeaders["X-PAYMENT"] = request.headers.get("X-PAYMENT")!;
    }

    const apiRequest = new Request(new URL(tool.endpoint, request.url).toString(), {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(args),
    });

    console.log("[KLAIM x402] Requesting payment requirements");
    const res = await handleVerifyAge(apiRequest);

    // If not 402, return directly (200 success or other error)
    if (res.status !== 402) {
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return { isError: true, content: `KLAIM verification failed: ${String(json['message'] ?? json['error'])}`, structured: json };
      }
      console.log("[KLAIM MCP] Returning verification result");
      return {
        isError: false,
        content: `${json['claim']} = ${String(json['verified'])}. No date of birth, Aadhaar, PAN, address or document was disclosed.`,
        structured: json,
      };
    }

    // 402 received — attempt server-side payment if payer is configured
    console.log("[KLAIM x402] 402 received");

    if (!payerConfigured()) {
      console.log("[KLAIM x402] Payer not configured — cannot complete payment");
      return {
        isError: true,
        content: `Payment required but payer wallet is not configured server-side. Missing: ${missingPayerEnv().join(", ")}. Configure PAYER_WALLET_ADDRESS and PAYER_PRIVATE_KEY to enable automatic payment.`,
        structured: { error: "PAYER_NOT_CONFIGURED", missing: missingPayerEnv() },
      };
    }

    // Sign payment using the same mechanism as scripts/test-x402.ts
    let paymentHeaders: Record<string, string>;
    try {
      paymentHeaders = await signPaymentFromResponse(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[KLAIM x402] Payment signing failed:", msg);
      return {
        isError: true,
        content: `Payment signing failed: ${msg}`,
        structured: { error: "PAYMENT_SIGNING_FAILED", message: msg },
      };
    }

    // Retry with payment attached
    console.log("[KLAIM x402] X-PAYMENT attached, retrying");
    const paidRequest = new Request(new URL(tool.endpoint, request.url).toString(), {
      method: "POST",
      headers: { ...baseHeaders, ...paymentHeaders },
      body: JSON.stringify(args),
    });

    const paidRes = await handleVerifyAge(paidRequest);
    const paidJson = (await paidRes.json()) as Record<string, unknown>;

    if (paidRes.status !== 200) {
      const msg = String(paidJson['message'] ?? paidJson['error'] ?? "Settlement failed");
      console.error("[KLAIM x402] Settlement/verification failed:", msg);
      return { isError: true, content: `Payment submitted but verification failed: ${msg}`, structured: paidJson };
    }

    // Success — real payment settled, verification complete
    const payment = paidJson['payment'] as { txId?: string; explorerUrl?: string } | undefined;
    console.log(`[KLAIM x402] Settlement successful`);
    console.log(`[KLAIM x402] Algorand TX: ${payment?.txId ?? "unknown"}`);
    console.log("[KLAIM MCP] Returning verification result");

    return {
      isError: false,
      content: `${paidJson['claim']} = ${String(paidJson['verified'])}. No date of birth, Aadhaar, PAN, address or document was disclosed. Payment settled on Algorand Testnet: ${payment?.explorerUrl ?? payment?.txId ?? ""}`,
      structured: paidJson,
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
