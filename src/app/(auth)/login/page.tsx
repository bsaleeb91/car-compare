import { LoginForm } from "./LoginForm";
import { safeNext } from "@/lib/safe-next";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Car Compare</h1>
      <p className="mt-1 text-muted">Research your next family car together.</p>
      <div className="card mt-6">
        <LoginForm next={next} initialError={error} />
      </div>
    </main>
  );
}
