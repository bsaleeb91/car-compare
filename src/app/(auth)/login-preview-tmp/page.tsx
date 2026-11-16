// TEMPORARY local visual check. Delete before committing.
import { ContactCard, FeatureChecks, LogCard, QuotesCard, StatusPicker } from "@/app/listings/[id]/parts";
import { FollowUpBadge } from "@/app/listings/bits";
const L = "00000000-0000-0000-0000-000000000001";
export default function Preview() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <section className="card space-y-4">
        <div className="flex justify-between"><div><p className="text-sm text-muted">Honda Odyssey</p><h1 className="text-2xl font-bold">2022 Honda Odyssey EX-L</h1><p className="text-sm text-muted">Sample Honda · 31,200 miles · Certified pre-owned</p></div>
        <div className="text-right"><p className="text-3xl font-bold">$33,900</p><FollowUpBadge date="2026-11-15" today="2026-11-16" /></div></div>
        <StatusPicker id={L} status="contacted" />
        <p className="rounded-xl bg-coral-soft p-3 text-sm font-medium text-coral">Missing must-have: AWD</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <ContactCard listingId={L} contact={{ dealership: "Sample Honda", salesperson: "Pat", phone: "(555) 010-0000", email: "pat@example.com" }} fallbackDealer={null} />
        <LogCard listingId={L} followUp="2026-11-15" today="2026-11-16" log={[{ id: "a", logged_on: "2026-11-14", channel: "call", summary: "Still available. Will hold until Saturday.", author: "Sam", mine: true }]} />
        <QuotesCard listingId={L} today="2026-11-16" quotes={[{ id: "q1", quoted_on: "2026-11-14", otd_price: 35200, apr_offered: 5.9, includes: "Doc fee, tint", expires_on: "2026-11-20" }, { id: "q2", quoted_on: "2026-11-10", otd_price: 36100, apr_offered: null, includes: null, expires_on: "2026-11-12" }]} />
        <FeatureChecks listingId={L} items={[{ id: "1", name: "AWD", tier: "must_have", status: "no", checked: undefined }, { id: "2", name: "Rear-seat camera", tier: "must_have", status: "trim", checked: true }, { id: "3", name: "Moonroof", tier: "nice_to_have", status: "trim", checked: undefined }]} />
      </div>
    </main>
  );
}
