/**
 * zkpService — the single abstraction behind every proof KLAIM produces.
 *
 * The verifier never receives DOB, Aadhaar, PAN, address or a document. The
 * private claim stays inside this service; only a boolean/qualified result and
 * a proof descriptor leave it.
 *
 * Engines:
 *   local    — deterministic claim evaluation over derived claims. Honest
 *              default; proofs are labelled engine="local" so no UI can call
 *              them zero-knowledge proofs.
 *   midnight — real ZK circuit, used as soon as MIDNIGHT_PROVER_URL is set.
 */
import { env, zkConfigured } from "./env.server";
import type { CredentialRecord } from "./store.server";

export interface ProofResult {
  verified: boolean;
  claim: string;
  proof: {
    id: string;
    engine: "local" | "midnight";
    /** Non-disclosed inputs — listed so the UI can show what stayed private. */
    notDisclosed: string[];
  };
}

const NOT_DISCLOSED = ["date_of_birth", "aadhaar_number", "pan_number", "address", "document_image"];

export const zkpService = {
  engine(): "local" | "midnight" {
    return zkConfigured() ? "midnight" : "local";
  },

  async prove(claim: string, credential: CredentialRecord): Promise<ProofResult> {
    const privateClaim = credential.derivedClaims[claim];
    const holds = privateClaim === true || privateClaim === "true";

    if (zkConfigured()) {
      const res = await fetch(`${env("MIDNIGHT_PROVER_URL")}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the claim identifier and the credential reference cross this
        // boundary — never document content.
        body: JSON.stringify({ claim, credentialRef: credential.credentialRef }),
      });
      if (!res.ok) throw new Error(`Midnight prover failed (${res.status})`);
      const json = (await res.json()) as { verified: boolean; proofId: string };
      return {
        verified: json.verified,
        claim,
        proof: { id: json.proofId, engine: "midnight", notDisclosed: NOT_DISCLOSED },
      };
    }

    return {
      verified: holds,
      claim,
      proof: {
        id: `proof_local_${crypto.randomUUID().slice(0, 8)}`,
        engine: "local",
        notDisclosed: NOT_DISCLOSED,
      },
    };
  },
};
