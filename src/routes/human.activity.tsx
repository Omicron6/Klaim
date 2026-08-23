import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { DemoTag, PageHeading, Panel, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/human/activity")({
  head: () => ({
    meta: [
      { title: "Activity — KLAIM" },
      { name: "description", content: "Verification and x402 payment history for your KLAIM identity, including claim, status, amount, network and transaction." },
      { property: "og:title", content: "Activity — KLAIM" },
      { property: "og:description", content: "Every verification request and its pay-per-use settlement in one ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { verifications } = useKlaim();

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Activity"
        title="Activity"
        subtitle="Verification requests made against your identity. Verifiers pay for these — you never do."
      />

      <Panel>
        <div className="divide-y divide-border">
          {verifications.map((v) => (
            <article key={v.id} className="grid gap-3 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">{v.claimLabel}</h2>
                  <StatusPill>✓ {v.status === "verified" ? "Verified" : "Failed"}</StatusPill>
                  {v.transaction.kind === "demo" ? <DemoTag label="Demo tx" /> : null}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Requested by {v.requestedBy} · {v.createdAt}
                </p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  Paid by verifier · {v.amountUsdc.toFixed(2)} USDC · {v.network}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Not disclosed: {v.notDisclosed.join(", ")}
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-none justify-self-start sm:justify-self-end"
                disabled={v.transaction.kind === "demo"}
                title={v.transaction.kind === "demo" ? "Available once x402 settlement is connected" : undefined}
              >
                <ExternalLink className="size-4" /> View on Lora
              </Button>
            </article>
          ))}
        </div>
      </Panel>

      <PrivacyNote>
        Transaction identifiers marked as demo are placeholders. Once x402 settlement is connected, this view will show
        the real Algorand Testnet transaction for each verification.
      </PrivacyNote>
    </div>
  );
}
