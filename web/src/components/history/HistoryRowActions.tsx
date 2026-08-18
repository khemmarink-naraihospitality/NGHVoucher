"use client";

import { useState } from "react";
import { claimVoucher, revokeVoucher } from "@/app/history/actions";

interface HistoryRowActionsProps {
  voucherId: string;
  status: string;
  role: string;
  /** Pre-fills "Claimed by" with the current user's own name — front office is usually claiming on their own behalf. */
  defaultClaimBy?: string;
}

type Mode = "idle" | "claiming" | "revoking";

// Reveal-on-click pattern, same as components/approve/ApprovalActions.tsx's
// reject flow — a button reveals a text input + confirm/cancel instead of
// a modal, since this renders inline inside a table row.
export function HistoryRowActions({ voucherId, status, role, defaultClaimBy }: HistoryRowActionsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [reservationNo, setReservationNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRevoke = role !== "front_office";

  function reset() {
    setMode("idle");
    setText("");
    setReservationNo("");
    setError(null);
  }

  async function handleClaim() {
    if (!text.trim()) {
      setError("Claim by is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await claimVoucher(voucherId, text, reservationNo);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    reset();
  }

  async function handleRevoke() {
    if (!text.trim()) {
      setError("A revoke reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await revokeVoucher(voucherId, text);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    reset();
  }

  if (status !== "pending_approval" && status !== "approved") return null;
  if (status === "pending_approval" && !canRevoke) return null;

  if (mode === "idle") {
    return (
      <div className="flex gap-2">
        {status === "approved" ? (
          <button
            type="button"
            onClick={() => {
              setText(defaultClaimBy ?? "");
              setMode("claiming");
            }}
            className="rounded-full bg-brand-dark/10 px-3 py-1 text-xs font-semibold text-brand-dark hover:bg-brand-dark/20"
          >
            Mark as Claimed
          </button>
        ) : null}
        {canRevoke ? (
          <button
            type="button"
            onClick={() => setMode("revoking")}
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Revoke
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-1">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={mode === "claiming" ? "Claimed by…" : "Revoke reason…"}
        className="rounded-full bg-white px-3 py-1 text-xs text-brand-dark"
      />
      {mode === "claiming" ? (
        <input
          type="text"
          value={reservationNo}
          onChange={(event) => setReservationNo(event.target.value)}
          placeholder="Reservation No. (optional)"
          className="rounded-full bg-white px-3 py-1 text-xs text-brand-dark"
        />
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={mode === "claiming" ? handleClaim : handleRevoke}
          className="rounded-full bg-brand-orange px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={reset}
          className="rounded-full border border-brand-dark/20 px-3 py-1 text-xs font-semibold text-brand-dark"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
