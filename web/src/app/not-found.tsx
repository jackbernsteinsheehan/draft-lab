import Link from "next/link";

export default function NotFound() {
  return (
    <main className="max-w-xl mx-auto px-4 md:px-6 py-16 text-center space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="inline-block text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition"
      >
        Back home
      </Link>
    </main>
  );
}
