import Link from "next/link";

/** The public landing page. Filled in with the full copy and SEO in the next task. */
export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Your personal glossary for learning a language</h1>
      <Link href="/sign-up" className="btn btn-primary mt-6">Create an account</Link>
    </main>
  );
}
