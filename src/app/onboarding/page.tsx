import { redirect } from "next/navigation";
import { getMembership, requireUser } from "@/lib/session";
import { CreateHouseholdForm } from "./CreateHouseholdForm";

export default async function OnboardingPage() {
  const { email } = await requireUser();
  if (await getMembership()) redirect("/");
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold">Set up your household</h1>
      <p className="mt-1 text-muted">
        Your household shares one shortlist, notes and test-drive scores. You can invite your partner next.
      </p>
      <div className="card mt-6">
        <CreateHouseholdForm />
      </div>
      <p className="mt-6 text-sm text-muted">
        Were you invited? Open the invite link from your email while signed in as{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>
      <form action="/auth/signout" method="post" className="mt-2">
        <button className="text-sm text-accent underline">Sign out</button>
      </form>
    </main>
  );
}
