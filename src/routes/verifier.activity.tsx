import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { DemoTag, KeyValue, PageHeading, Panel, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier/activity")({
  head: () => ({
    meta: [
      { title: "Activity — KLAIM Verifier" },
      {
        name: "description",
        content:
          "Every verification your agents requested: claim, payment, settlement and result, with the Algorand Testnet transaction for each request.",
      },
      { property: "og:title", content: "Activity — KLAIM Verifier" },
      { property: "og:description", content: "Request, payment, settlement and result for each agent verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifierActivityPage,
});

function VerifierActivityPage() {
  const { verifications } = useKlaim();

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Activity"
        title="Activity"
        subtitle="Verification requested → payment → settlement → result."
      />

      <Panel>
        <div className="divide-y divide-border">
          {verifications.map((v) => (
            <article key={v.id} className="grid gap-4 p-5 sm:grid-cols-[1.2fr_auto] sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">{v.claimLabel}</h2>
                  <StatusPill>✓ {v.status === "verified" ? "Verified" : "Failed"}</StatusPill>
                  {v.transaction.kind === "demo" ? <DemoTag label="Demo tx" /> : null}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Requested by {v.requestedBy} · Subject {v.subjectDid} · {v.createdAt}
                </p>
                <div className="mt-3">
                  <KeyValue label="Paid" value={`${v.amountUsdc.toFixed(2)} USDC`} />
                  <KeyValue label="Network" value={v.network} />
                  <KeyValue label="Transaction" value={<span className="text-muted-foreground">{v.transaction.id}</span>} />
                  <KeyValue label="Not disclosed" value={<span className="text-muted-foreground">{v.notDisclosed.join(", ")}</span>} />
                </div>
              </div>
              <Button
                variant="outline"
                className="justify-self-start rounded-none sm:justify-self-end"
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
        Transaction identifiers marked as demo are placeholders. Once x402 settlement is connected this view shows the
        real Algorand Testnet transaction for each verification.
      </PrivacyNote>
    </div>
  );
}
