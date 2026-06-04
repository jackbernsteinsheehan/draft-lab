import AuthForm from "./AuthForm";

export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const mode = sp.mode === "signup" ? "signup" : "signin";
  const next = sp.next ?? "/";
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <AuthForm initialMode={mode} next={next} />
    </main>
  );
}
