#!/bin/sh
set -eu
node /app/crm-preflight.mjs
exec "$@"
