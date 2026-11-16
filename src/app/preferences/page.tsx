import { AppHeader } from "@/components/AppHeader";
import { requireMembership } from "@/lib/session";
import { getPreferences } from "@/lib/data";
import { PreferencesForm } from "./PreferencesForm";

export const metadata = { title: "Preferences · Car Compare" };

export default async function PreferencesPage() {
  const m = await requireMembership();
  const prefs = await getPreferences(m.household.id);
  return (
    <>
      <AppHeader membership={m} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Preferences</h1>
          <p className="text-sm text-muted">Shared by everyone in {m.household.name}. These drive the compare table.</p>
        </div>
        <PreferencesForm prefs={prefs} />
      </main>
    </>
  );
}
