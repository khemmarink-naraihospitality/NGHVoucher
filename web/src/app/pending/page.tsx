import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { SignOutButton } from "@/components/auth/SignOutButton";

// Landing spot for every protected page's status gate (see app/page.tsx,
// app/history/page.tsx, app/admin/page.tsx, app/admin/template/[propertyId]/
// page.tsx — each redirects here when profile.status !== "active"). An
// admin flips status to active (and assigns properties) from Admin -> Users.
export default async function PendingPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (profile.status === "active") {
    redirect("/");
  }

  const rejected = profile.status === "rejected";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-brand-dark">
          {rejected ? "Access denied" : "Waiting for approval"}
        </h1>
        <p className="text-sm text-brand-dark/70">
          {rejected
            ? "Your access request was denied. If you think this is a mistake, contact your administrator."
            : `Signed in as ${profile.email}. An admin needs to approve your account before you can use this app. Check back later, or ask your admin to approve you.`}
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}
