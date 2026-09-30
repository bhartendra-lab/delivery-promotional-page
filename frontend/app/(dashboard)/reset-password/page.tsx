import { redirect } from "next/navigation";

/**
 * Retired. Studios used to set a password here from an emailed link; Delivery
 * Hub sign-in is now an emailed code (or Google) on /login, and there is no
 * password to set. Kept as a redirect so set-password links still sitting in
 * inboxes land on sign-in instead of a 404 — the code they get there also
 * verifies an account that never finished the old setup.
 */
export default function ResetPasswordPage() {
  redirect("/login");
}
