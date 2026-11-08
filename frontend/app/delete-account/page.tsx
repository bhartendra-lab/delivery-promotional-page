import { DeleteAccountForm } from "./DeleteAccountForm";

/**
 * deliver.vyavasth.in/delete-account — delete a Vyavasth app account from the
 * web (Google Play requires a link; the in-app path stays the primary one).
 * Not on studio custom domains: lib/host-gate.ts serves them the guest surface
 * only, so this 404s there.
 */
export const metadata = { title: "Delete your Vyavasth account", robots: { index: false } };

export default function Page() {
  return <DeleteAccountForm />;
}
