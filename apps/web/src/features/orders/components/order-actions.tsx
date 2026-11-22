"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptOrder,
  adminMarkDelivered,
  adminRefundOrder,
  cancelOrder,
  confirmDelivery,
  declineOrder,
  markPayoutPaid,
  markShipped,
} from "@/features/orders/actions/orders";

type Res = { ok: true; data: unknown } | { ok: false; error: string };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
      if (r.ok) router.refresh();
    });
  };
  const err = error ? <p role="alert" className="text-destructive mt-2 text-sm">{error}</p> : null;
  return { pending, run, err };
}

// ── buyer ──────────────────────────────────────────────────────────────────

export function BuyerOrderActions({ sellerOrderId, status, confirmed }: { sellerOrderId: string; status: string; confirmed: boolean }) {
  const { pending, run, err } = useAct();
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-3">
        {status === "paid" && (
          <button
            type="button"
            disabled={pending}
            className="studio-button"
            onClick={() => run(() => cancelOrder({ sellerOrderId }), "Cancel this part of your order and get a full refund?")}
          >
            Cancel and refund
          </button>
        )}
        {(status === "shipped" || (status === "delivered" && !confirmed)) && (
          <button
            type="button"
            disabled={pending}
            className="studio-button"
            onClick={() => run(() => confirmDelivery({ sellerOrderId }), "Confirm you received this work? Payment is then released to the artist.")}
          >
            I received it
          </button>
        )}
      </div>
      {err}
    </div>
  );
}

// ── seller ─────────────────────────────────────────────────────────────────

export function SellerOrderActions({ sellerOrderId, status }: { sellerOrderId: string; status: string }) {
  const { pending, run, err } = useAct();
  const [reason, setReason] = useState("");
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  if (status === "paid") {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" disabled={pending} className="studio-button" onClick={() => run(() => acceptOrder({ sellerOrderId }))}>
            Accept order
          </button>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="studio-input" aria-label="Reason for declining" />
          <button
            type="button"
            disabled={pending}
            className="text-sm underline"
            onClick={() => run(() => declineOrder({ sellerOrderId, reason }), "Decline this order? The buyer is refunded and the work goes back on sale.")}
          >
            Decline and refund
          </button>
        </div>
        {err}
      </div>
    );
  }
  if (status === "processing") {
    return (
      <form
        className="mt-3 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => markShipped({ sellerOrderId, courier, awb, trackingUrl }));
        }}
      >
        <input required value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier (e.g. Delhivery)" className="studio-input" aria-label="Courier" />
        <input required value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="Tracking number (AWB)" className="studio-input" aria-label="Tracking number" />
        <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="Tracking link (optional)" className="studio-input" aria-label="Tracking link" />
        <div className="sm:col-span-3">
          <button type="submit" disabled={pending} className="studio-button">
            Mark as shipped
          </button>
          {err}
        </div>
      </form>
    );
  }
  return null;
}

// ── Finance ────────────────────────────────────────────────────────────────

export function AdminOrderActions({ sellerOrderId, status, totalPaise, refundedPaise }: { sellerOrderId: string; status: string; totalPaise: number; refundedPaise: number }) {
  const { pending, run, err } = useAct();
  const [rupees, setRupees] = useState("");
  const [reason, setReason] = useState("");
  const remaining = totalPaise - refundedPaise;
  const refundable = ["paid", "processing", "shipped", "delivered"].includes(status) && remaining > 0;
  return (
    <div className="flex flex-col gap-2">
      {status === "shipped" && (
        <button type="button" disabled={pending} className="studio-button" onClick={() => run(() => adminMarkDelivered({ sellerOrderId }))}>
          Mark delivered
        </button>
      )}
      {refundable && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const amountPaise = rupees.trim() ? Math.round(Number(rupees) * 100) : undefined;
            run(() => adminRefundOrder({ sellerOrderId, amountPaise, reason }), amountPaise ? undefined : "Refund the whole remaining amount?");
          }}
        >
          <input value={rupees} onChange={(e) => setRupees(e.target.value)} inputMode="decimal" placeholder={`₹ (blank = full ${remaining / 100})`} className="studio-input w-40" aria-label="Refund amount in rupees" />
          <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className="studio-input" aria-label="Refund reason" />
          <button type="submit" disabled={pending} className="studio-button">
            Refund
          </button>
        </form>
      )}
      {err}
    </div>
  );
}

export function PayoutForm({ payoutId, identityVerified }: { payoutId: string; identityVerified: boolean }) {
  const { pending, run, err } = useAct();
  const [utr, setUtr] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => markPayoutPaid({ payoutId, utr }));
      }}
    >
      <input required value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="Bank UTR" className="studio-input w-40" aria-label="Bank reference (UTR)" />
      <button type="submit" disabled={pending || !identityVerified} title={identityVerified ? undefined : "Payee identity is not verified"} className="studio-button">
        Mark paid
      </button>
      {err}
    </form>
  );
}
