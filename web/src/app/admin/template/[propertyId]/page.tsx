import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { DEFAULT_BREAKFAST_CHECKBOX, DEFAULT_FIELDS, DEFAULT_SIGNATURE_FIELD } from "@/lib/templates/config";
import type { TemplateConfigJson } from "@/lib/templates/config";
import { TemplateFieldEditor } from "@/components/admin/TemplateFieldEditor";

interface PropertyRow {
  id: number;
  code: string;
  name: string;
  template_config: TemplateConfigJson | null;
}

export default async function TemplateLayoutPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/login?next=/admin/template/${propertyId}`);
  }
  if (profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const [{ data: property }, { data: signedApprovers }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name, template_config")
      .eq("id", Number(propertyId))
      .maybeSingle(),
    // Every approver with a real uploaded signature — Admin picks which
    // one to preview with in the editor, since signature shape/size
    // varies per person and the layout should work for all of them.
    supabase.from("approvers").select("id, name, signature_url").not("signature_url", "is", null).order("name"),
  ]);

  const row = property as PropertyRow | null;
  if (!row) notFound();
  if (!row.template_config?.imagePath || !row.template_config.canvasWidth || !row.template_config.canvasHeight) {
    redirect("/admin");
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader activeTab="admin" userEmail={profile.email} isAdmin />

      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <Link href="/admin" className="text-sm text-brand-dark/60 underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-lg font-bold text-brand-dark">
          Edit layout — {row.name} ({row.code})
        </h1>
        <p className="mt-1 text-sm text-brand-dark/60">
          Drag a label to reposition it; click one to fine-tune size/color/alignment. Sample data
          below is illustrative, not real.
        </p>

        <div className="mt-6">
          <TemplateFieldEditor
            propertyId={row.id}
            propertyCode={row.code}
            propertyName={row.name}
            imagePath={row.template_config.imagePath}
            canvasWidth={row.template_config.canvasWidth}
            canvasHeight={row.template_config.canvasHeight}
            initialFields={row.template_config.fields ?? DEFAULT_FIELDS}
            initialBreakfastCheckbox={row.template_config.breakfastCheckbox ?? DEFAULT_BREAKFAST_CHECKBOX}
            initialSignatureField={row.template_config.signatureField ?? DEFAULT_SIGNATURE_FIELD}
            sampleSignatures={(signedApprovers ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              signatureUrl: a.signature_url as string,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
