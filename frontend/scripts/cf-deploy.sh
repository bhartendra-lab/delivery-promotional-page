#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

target="${1:-prod}"
shift || true

dotenv_cli=(npx dotenv)

if [[ "$target" == "dev" ]]; then
  build_env=(-e .env.production.local -e .env.production.dev)
  wrangler_config="wrangler.dev.jsonc"
else
  build_env=(-e .env.production.local)
  wrangler_config="wrangler.jsonc"
fi

echo "Building (${target})..."
"${dotenv_cli[@]}" "${build_env[@]}" -o -- npx opennextjs-cloudflare build

if [[ "$target" == "dev" ]]; then
  "${dotenv_cli[@]}" "${build_env[@]}" -o -- node -e "console.log('Build env (dev overrides .env.production.local):'); console.log('  NEXT_PUBLIC_API_BASE_URL=' + process.env.NEXT_PUBLIC_API_BASE_URL); console.log('  NEXT_PUBLIC_BASE_URL=' + process.env.NEXT_PUBLIC_BASE_URL);"
fi

deploy_env=(env -u CF_ACCOUNT_ID -u CF_KV_AUTH_TOKEN -u CF_API_TOKEN)

if [[ -f .env.deploy.local ]]; then
  echo "Deploying with .env.deploy.local..."
  "${dotenv_cli[@]}" -e .env.deploy.local -o -- "${deploy_env[@]}" \
    npx opennextjs-cloudflare deploy --config "$wrangler_config" "$@"
else
  echo "Deploying with wrangler OAuth (run 'npx wrangler login' if auth fails)..."
  "${deploy_env[@]}" npx opennextjs-cloudflare deploy --config "$wrangler_config" "$@"
fi
