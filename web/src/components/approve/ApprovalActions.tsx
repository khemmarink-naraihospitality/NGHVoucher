"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApprovalActionsProps {
  token: string;
}

export function ApprovalActions({ token }: ApprovalActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Failed to approve.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve.");
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Failed to reject.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {mode === "idle" ? (
        <div className="flex gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={handleApprove}
            className="flex-1 rounded-full bg-brand-orange py-3 font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setMode("rejecting")}
            className="flex-1 rounded-full border border-brand-dark/20 py-3 font-semibold text-brand-dark transition-opacity disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-brand-dark">Rejection reason</label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Why is this request being rejected?"
            className="w-full rounded-2xl bg-white p-3 text-brand-dark placeholder:text-brand-dark/40"
          />
          <div className="flex gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={handleReject}
              className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {submitting ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="flex-1 rounded-full border border-brand-dark/20 py-3 font-semibold text-brand-dark"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
