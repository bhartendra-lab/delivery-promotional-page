import { redirect } from "next/navigation";

// Plan & Storage merged into Plan & Billing (SettingsNav) — kept as a
// permanent redirect so bookmarks and any stale link don't 404.
export default function PlanRedirect() {
  redirect("/dashboard/settings/billing");
}
