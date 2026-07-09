#!/bin/sh

# 1. Run your custom init logic in the background
/init.sh &

# 2. Forward all arguments to the real MinIO entrypoint
exec /usr/bin/docker-entrypoint.sh "$@"
