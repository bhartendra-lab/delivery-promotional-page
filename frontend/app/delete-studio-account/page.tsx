import { DeleteStudioAccountForm } from "./DeleteStudioAccountForm";

/**
 * deliver.vyavasth.in/delete-studio-account — delete a Vyavasth studio account
 * from the web (Google Play requires a page that works without the app; the
 * app's Studio tab and the dashboard's Personal Information stay the primary
 * paths). Not on studio custom domains: lib/host-gate.ts serves them the guest
 * surface only, so this 404s there.
 */
export const metadata = { title: "Delete your Vyavasth studio account", robots: { index: false } };

export default function Page() {
  return <DeleteStudioAccountForm />;
}
