#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ -f .env ]; then
  node --env-file=.env scripts/launch.mjs
else
  node scripts/launch.mjs
fi
printf '\nPress Return to close.'
read -r answer
