import { AuthCallbackClient } from "./AuthCallbackClient";

/**
 * OAuth landing — the backend redirects here as
 * `/event/<unique_identifier>/auth/callback?token=<JWT>` after Google sign-in.
 * Captures the token, stores it scoped to this event, and bounces back in.
 */
export default async function AuthCallbackPage({
  params,
}: {
  params: Promise<{ unique_identifier: string }>;
}) {
  const { unique_identifier } = await params;
  return <AuthCallbackClient uniqueIdentifier={unique_identifier} />;
}
