import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-3xl bg-brand-lime p-8 text-center">
        <h1 className="text-lg font-bold text-brand-dark">Lub d Room Voucher Generator</h1>
        <p className="mt-1 text-sm text-brand-dark/60">Sign in to create or review vouchers.</p>
        <div className="mt-6">
          <GoogleSignInButton next={next ?? "/"} />
        </div>
      </div>
    </div>
  );
}
