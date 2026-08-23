import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Wallet } from "lucide-react";

import {
  DemoTag,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatusPill,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { SettlementReceipts } from "@/components/app/settlement-receipts";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier/payments")({
  head: () => ({
    meta: [
      { title: "Payments — KLAIM Verifier" },
      {
        name: "description",
        content:
          "Wallet, USDC balance and x402 settlement history for agent-initiated human verifications on Algorand Testnet.",
      },
      { property: "og:title", content: "Payments — KLAIM Verifier" },
      { property: "og:description", content: "Per-verification x402 settlements in USDC on Algorand Testnet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { verifications } = useKlaim();

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Payments"
        title="Payments"
        subtitle="Every verification your agent requests is settled per use with x402."
      />

      <SettlementReceipts />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel accent>
          <PanelHeader title="Wallet" hint="Demo" />
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center border border-border bg-background text-primary">
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="text-sm text-foreground">Algorand Testnet</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Agent settlement wallet
                </p>
              </div>
            </div>
            <div>
              <KeyValue label="USDC Balance" value={<span className="text-foreground">$10.00 (demo)</span>} />
              <KeyValue label="x402 Status" value={<span className="text-primary">● Enabled</span>} />
              <KeyValue label="Facilitator" value={<span className="text-muted-foreground">Not connected</span>} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Settlement model" />
          <div className="px-5 py-2">
            <KeyValue label="Protocol" value="x402" />
            <KeyValue label="Asset" value="USDC" />
            <KeyValue label="Network" value="Algorand Testnet" />
            <KeyValue label="Price per verification" value="0.01 USDC" />
          </div>
          <div className="p-5 pt-3">
            <PrivacyNote>
              Balances and transactions shown here are demo placeholders. Once the x402 backend is connected this page
              renders real Algorand Testnet settlements.
            </PrivacyNote>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Payment history" hint="x402 settlements" />
        <div className="divide-y divide-border">
          {verifications.map((v) => (
            <article key={v.id} className="grid gap-3 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">{v.claimLabel}</h2>
                  <StatusPill>✓ Settled</StatusPill>
                  {v.transaction.kind === "demo" ? <DemoTag label="Demo" /> : null}
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {v.amountUsdc.toFixed(2)} USDC · {v.network} · {v.transaction.id}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{v.createdAt}</p>
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
    </div>
  );
}
