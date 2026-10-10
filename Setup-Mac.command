#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 20+ from https://nodejs.org/, then run Setup again.'
else
  node scripts/setup.mjs
fi
printf '\nPress Return to close.'
read -r answer
