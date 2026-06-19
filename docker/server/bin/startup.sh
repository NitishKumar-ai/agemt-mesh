#!/bin/sh
# ---------------------------------------------------------------------------
# AgentMesh server startup script
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not
# use this file except in compliance with the License. You may obtain a copy at
# http://www.apache.org/licenses/LICENSE-2.0
# ---------------------------------------------------------------------------

# exec replaces the shell process with Node so signals (SIGTERM, etc.)
# are delivered directly to the application for graceful shutdown.
exec node /app/server-lite/dist/index.js
