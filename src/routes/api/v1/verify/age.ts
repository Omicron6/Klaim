/**
 * KLAIM Verification API — x402-protected.
 *
 *   POST /api/v1/verify/age
 *   Authorization: Bearer klm_...        (KLAIM agent access key)
 *   X-KLAIM-Agent-Id: agent_...
 *   X-PAYMENT: <x402 payment payload>    (absent on the first call)
 *
 * Order is load-bearing:
 *
 *   402 (official x402 SDK) → payment → GoPlausible → Algorand settlement
 *   → Strands provider agent → credential check → ZK verification → 200
 *
 * The protected verification result NEVER executes before settlement confirms.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { providerAgentService } from "@/lib/klaim/server/provider-agent.server";
import { repository } from "@/lib/klaim/server/store.server";
import { requirePayment, verificationPriceUsdc } from "@/lib/klaim/server/x402.server";

const CLAIM = "age_over_18";
const PATH = "/api/v1/verify/age";

const bodySchema = z.object({ did: z.string().min(6).max(200) });

export async function handleVerifyAge(request: Request): Promise<Response> {
  const agentId = request.headers.get("X-KLAIM-Agent-Id");
  const authorization = request.headers.get("Authorization");
  const key = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : null;
  const agent = await repository.authenticateAgent(agentId, key);
  if (!agent) {
    return Response.json({ error: "unauthorized", message: "Invalid or missing KLAIM agent credential" }, { status: 401 });
  }

  let body: unknown;
  let parsed: { did: string };
  try {
    body = await request.json();
    parsed = bodySchema.parse(body);
  } catch {
    return Response.json({ error: "invalid_request", message: "Body must be { did: string }" }, { status: 400 });
  }

  const price = verificationPriceUsdc();
  if (price > agent.spending.perRequestLimitUsdc) {
    return Response.json(
      { error: "spend_limit_exceeded", message: "Per-request spending limit is lower than the price" },
      { status: 403 },
    );
  }

  // ---- x402 boundary -------------------------------------------------------
  const gate = await requirePayment({ request, path: PATH, body, amountUsdc: price });

  if (gate.type !== "paid") {
    repository.recordTransaction({
      agentId: agent.id,
      claim: CLAIM,
      amountUsdc: price,
      asset: "USDC",
      network: "algorand:testnet",
      facilitator: "GoPlausible",
      txId: null,
      status: "requires_payment",
    });
    return gate.response;
  }

  const settlement = await gate.settle();
  if (!settlement.ok) {
    repository.recordTransaction({
      agentId: agent.id,
      claim: CLAIM,
      amountUsdc: price,
      asset: "USDC",
      network: "algorand:testnet",
      facilitator: "GoPlausible",
      txId: null,
      status: "failed",
    });
    return settlement.response;
  }
  const receipt = settlement.receipt;

  // ---- paid: provider agent may now run ------------------------------------
  const result = await providerAgentService.verifyAgeOver18(parsed.did);

  const tx = repository.recordTransaction({
    agentId: agent.id,
    claim: CLAIM,
    amountUsdc: receipt.amount,
    asset: "USDC",
    network: receipt.network,
    facilitator: receipt.facilitator,
    txId: receipt.txId,
    explorerUrl: receipt.explorerUrl,
    status: "settled",
  });

  repository.audit(
    parsed.did,
    result.verified ? "verification.completed" : "verification.declined",
    `Agent ${agent.id} requested ${CLAIM} → ${result.verified} (runtime=${result.runtime}, tx=${receipt.txId})`,
  );

  return Response.json({
    verified: result.verified,
    claim: CLAIM,
    ...(result.reason ? { reason: result.reason } : {}),
    proof: result.proof
      ? { verified: result.proof.verified, engine: result.proof.engine, id: result.proof.id, notDisclosed: result.proof.notDisclosed }
      : { verified: false, engine: "local" },
    providerAgent: { runtime: result.runtime, steps: result.steps },
    payment: {
      status: receipt.status,
      network: receipt.network,
      asset: receipt.asset,
      amount: receipt.amount,
      facilitator: receipt.facilitator,
      txId: receipt.txId,
      explorerUrl: receipt.explorerUrl,
      timestamp: receipt.timestamp,
      recordId: tx.id,
    },
  });
}

export const Route = createFileRoute("/api/v1/verify/age")({
  server: { handlers: { POST: ({ request }) => handleVerifyAge(request) } },
});
