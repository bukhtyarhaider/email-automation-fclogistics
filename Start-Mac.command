#!/bin/sh
cd "$(dirname "$0")" || exit 1
node scripts/launch.mjs
printf '\nPress Return to close.'
read -r answer
