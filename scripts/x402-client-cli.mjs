#!/usr/bin/env node

import { runX402ClientCli } from "../src/services/x402-client.mjs";

runX402ClientCli().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
