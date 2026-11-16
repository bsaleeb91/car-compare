import { LoginForm } from "./LoginForm";
import { CarIcon } from "@/components/AppHeader";
import { safeNext } from "@/lib/safe-next";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="hero relative overflow-hidden rounded-3xl p-6 shadow-xl shadow-accent/25">
        <div aria-hidden className="absolute -right-12 -top-12 size-44 rounded-full bg-white/10" />
        <span aria-hidden className="relative grid size-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <CarIcon />
        </span>
        <h1 className="relative mt-4 text-3xl font-bold">Car Compare</h1>
        <p className="relative mt-1 text-white/85">Research your next family car together.</p>
      </div>
      <div className="card -mt-4 mx-3 relative">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
