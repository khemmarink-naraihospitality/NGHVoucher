"use client";

import { useState } from "react";
import { buildTemplateConfig } from "@/lib/templates/config";
import { createDefaultVoucherFormState } from "@/lib/voucher/types";
import type { VoucherWorkspaceCatalog } from "@/lib/voucher/catalog";
import {
  formatBlackoutText,
  formatRoomTypeNights,
  formatRunningNo,
  formatValidityRange,
} from "@/lib/voucher/format";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CreateVoucherForm } from "./CreateVoucherForm";
import { VoucherCanvasPreview } from "./VoucherCanvasPreview";

interface VoucherWorkspaceProps {
  catalog: VoucherWorkspaceCatalog;
}

interface SubmitResult {
  runningNumbers: string[];
  approveUrl: string;
  emailSent: boolean;
}

export function VoucherWorkspace({ catalog }: VoucherWorkspaceProps) {
  // Only properties Admin has uploaded a template image for are usable
  // here — other properties (e.g. once Admin adds Siem Reap/Manila Makati
  // per PRD §12) need template art before they can render a preview.
  const templateProperties = catalog.properties.filter((p) => p.templateConfig?.imagePath);

  const [propertyCode, setPropertyCode] = useState(
    templateProperties[0]?.code ?? catalog.properties[0]?.code ?? "",
  );
  const [formState, setFormState] = useState(() => createDefaultVoucherFormState(propertyCode));
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const catalogProperty = catalog.properties.find((p) => p.code === propertyCode);
  const template = catalogProperty
    ? buildTemplateConfig(catalogProperty.code, catalogProperty.name, catalogProperty.templateConfig)
    : null;
  const lastNumber = catalogProperty?.lastNumber ?? 0;
  const currentNumber = lastNumber + 1;
  const roomTypeOptions = catalog.roomTypes.filter((rt) => rt.propertyId === catalogProperty?.id);
  const approverOptions = catalog.approvers.filter(
    (a) => catalogProperty && a.propertyIds.includes(catalogProperty.id),
  );

  function switchProperty(nextCode: string) {
    setPropertyCode(nextCode);
    setFormState(createDefaultVoucherFormState(nextCode));
    setSubmitResult(null);
    setSubmitError(null);
  }

  // PRD §4: preview updates in real time, debounced ~150-300ms.
  const debouncedState = useDebouncedValue(formState, 200);

  const roomTypeNames = debouncedState.roomTypeIds
    .map((id) => catalog.roomTypes.find((rt) => rt.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  // Position/signature are just approver attributes, known as soon as one
  // is picked from the "Send for Approval" dropdown — not proof that
  // they've actually approved. The date stays blank until that really
  // happens (see approve/[token]/page.tsx), but showing who will sign and
  // their title is a fair WYSIWYG preview of the eventual voucher.
  const selectedApprover = catalog.approvers.find((a) => String(a.id) === debouncedState.approverId);

  const renderableVoucher = {
    runningNo: formatRunningNo(propertyCode, currentNumber),
    roomTypeNightsLabel: formatRoomTypeNights(roomTypeNames, debouncedState.nights),
    breakfastIncluded: debouncedState.breakfastIncluded,
    validityLabel: formatValidityRange(debouncedState.validityStart, debouncedState.validityEnd),
    blackoutText: formatBlackoutText(debouncedState.blackoutText),
    approverPosition: selectedApprover?.position ?? undefined,
  };

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);

    try {
      const response = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyCode,
          roomTypeIds: formState.roomTypeIds,
          nights: formState.nights,
          voucherCount: formState.voucherCount,
          breakfastIncluded: formState.breakfastIncluded,
          blackoutType: formState.blackoutType,
          blackoutText: formState.blackoutText,
          validityStart: formState.validityStart,
          validityEnd: formState.validityEnd,
          note: formState.note,
          approverId: formState.approverId,
          itemName: formState.itemName,
          purpose: formState.purpose,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to submit voucher request.");
      }

      setSubmitResult({
        runningNumbers: body.runningNumbers,
        approveUrl: body.approveUrl,
        emailSent: body.emailSent,
      });
      setFormState(createDefaultVoucherFormState(propertyCode));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit voucher request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="rounded-3xl bg-brand-lime p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex flex-wrap gap-1 rounded-full bg-white/60 p-1">
            {catalog.properties.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => switchProperty(option.code)}
                className={[
                  "rounded-full px-3 py-1 text-sm font-semibold transition-colors",
                  option.code === propertyCode ? "bg-brand-dark text-white" : "text-brand-dark/70",
                ].join(" ")}
              >
                {option.code}
              </button>
            ))}
          </div>
        </div>

        <p className="text-brand-dark">
          Last No. {formatRunningNo(propertyCode, lastNumber)}
        </p>
        <p className="text-2xl font-bold text-brand-dark">
          Current No. {formatRunningNo(propertyCode, currentNumber)}
        </p>

        <div className="mt-6">
          <CreateVoucherForm
            state={formState}
            roomTypeOptions={roomTypeOptions}
            approverOptions={approverOptions}
            onChange={(next) => {
              setFormState(next);
              setSubmitResult(null);
              setSubmitError(null);
            }}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        </div>

        {submitResult ? (
          <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm text-brand-dark">
            Sent for approval — reserved running number
            {submitResult.runningNumbers.length > 1 ? "s" : ""}:{" "}
            <strong>{submitResult.runningNumbers.join(", ")}</strong>.{" "}
            {submitResult.emailSent ? (
              "The approver has been emailed a review link."
            ) : (
              <>
                Email isn&apos;t configured yet (see <code>npm run email:test</code>) — approver
                link:{" "}
                <a href={submitResult.approveUrl} className="underline break-all">
                  {submitResult.approveUrl}
                </a>
              </>
            )}
          </div>
        ) : null}

        {submitError ? (
          <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{submitError}</div>
        ) : null}
      </section>

      <section className="lg:sticky lg:top-10 lg:self-start">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-dark/60">
          Live preview — {catalogProperty?.name ?? propertyCode}
        </p>
        {template ? (
          <VoucherCanvasPreview
            template={template}
            voucher={renderableVoucher}
            signatureImageUrl={selectedApprover?.signatureUrl ?? undefined}
          />
        ) : (
          <p className="rounded-3xl bg-brand-dark/5 p-6 text-sm text-brand-dark/60">
            No template image uploaded for this property yet — an Admin can add one from the Admin
            page.
          </p>
        )}
      </section>
    </div>
  );
}
