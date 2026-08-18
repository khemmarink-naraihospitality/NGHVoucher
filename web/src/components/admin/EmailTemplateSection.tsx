import { ChevronDownIcon } from "@/components/ui/ChevronDownIcon";
import { saveEmailTemplate, type EmailTemplateKind } from "@/app/admin/actions";

interface EmailTemplateSectionProps {
  kind: EmailTemplateKind;
  title: string;
  description: string;
  placeholders: readonly string[];
  template: { subject: string; html: string; text: string };
  isCustom: boolean;
  preview: { subject: string; html: string };
  previewTitle: string;
  previewHeightClassName?: string;
}

// Server component (no client state needed — <details> and <form
// action={serverAction}> both work natively) shared by the approval-request
// and both issuer-notification email sections in app/admin/page.tsx, so the
// preview + edit/reset markup exists once instead of three times over.
export function EmailTemplateSection({
  kind,
  title,
  description,
  placeholders,
  template,
  isCustom,
  preview,
  previewTitle,
  previewHeightClassName = "h-72",
}: EmailTemplateSectionProps) {
  return (
    <div className="border-t border-dashed border-brand-dark/15 pt-3">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">{title}</span>
      <p className="mt-0.5 text-xs text-brand-dark/50">{description}</p>

      <div className="mt-2 overflow-hidden rounded-xl border border-brand-dark/10 bg-white">
        <div className="border-b border-brand-dark/10 bg-brand-dark/5 px-3 py-2 text-xs text-brand-dark/70">
          <span className="font-semibold text-brand-dark/50">Subject: </span>
          {preview.subject}
        </div>
        {/* Iframe, not dangerouslySetInnerHTML directly in the page — the
            template's inline styles (table layout, hex colors meant to
            survive email clients) shouldn't inherit or leak into the
            admin page's own Tailwind styles, and vice versa. */}
        <iframe title={previewTitle} srcDoc={preview.html} className={`${previewHeightClassName} w-full`} />
      </div>

      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-dark/60 marker:content-none">
          <ChevronDownIcon className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
          Edit template
          <span className="rounded-full bg-brand-dark/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-dark/50">
            {isCustom ? "Custom" : "Default"}
          </span>
        </summary>

        <div className="mt-2 space-y-2">
          <p className="text-xs text-brand-dark/50">
            Placeholders, filled in with the real values at send time:{" "}
            {placeholders.map((token, i) => (
              <span key={token}>
                {i > 0 ? ", " : ""}
                <code className="rounded bg-brand-dark/10 px-1 py-0.5 text-[11px]">{`{{${token}}}`}</code>
              </span>
            ))}
            .
          </p>

          <form action={saveEmailTemplate} className="space-y-2">
            <input type="hidden" name="kind" value={kind} />
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                Subject
              </span>
              <input
                name="subjectTemplate"
                defaultValue={template.subject}
                className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 font-mono text-xs text-brand-dark"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                HTML
              </span>
              <textarea
                name="htmlTemplate"
                defaultValue={template.html.trim()}
                rows={10}
                spellCheck={false}
                className="mt-0.5 w-full rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-snug text-brand-dark"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                Plain-text fallback
              </span>
              <textarea
                name="textTemplate"
                defaultValue={template.text}
                rows={6}
                spellCheck={false}
                className="mt-0.5 w-full rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-snug text-brand-dark"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-brand-dark/10 px-4 py-1.5 text-xs font-semibold text-brand-dark"
            >
              Save template
            </button>
          </form>

          {isCustom ? (
            // Separate form with hardcoded blank values, deliberately not
            // wired to the textareas above — a reset shouldn't depend on
            // the admin having cleared them by hand first.
            <form action={saveEmailTemplate}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="subjectTemplate" value="" />
              <input type="hidden" name="htmlTemplate" value="" />
              <input type="hidden" name="textTemplate" value="" />
              <button type="submit" className="text-xs text-brand-dark/50 underline">
                Reset to default
              </button>
            </form>
          ) : null}
        </div>
      </details>
    </div>
  );
}
