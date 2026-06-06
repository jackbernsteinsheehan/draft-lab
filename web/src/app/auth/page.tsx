import AuthForm from "./AuthForm";

export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const mode = sp.mode === "signup" ? "signup" : "signin";
  const next = sp.next ?? "/";
  const initialError =
    sp.error === "auth_callback"
      ? "We couldn't confirm that link. Please sign in, or request a new one."
      : null;
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <AuthForm initialMode={mode} next={next} initialError={initialError} />
    </main>
  );
}
