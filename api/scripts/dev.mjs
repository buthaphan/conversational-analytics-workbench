// Development server: recompiles on change (tsc --watch) and restarts on new output (node --watch).
// Uses only Node built-ins; loads ../.env when it exists.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");

const compile = spawn(
  process.execPath,
  [tsc, "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
  { stdio: "inherit" },
);

// Wait for the first build before starting the server.
const waitForBuild = setInterval(() => {
  if (!existsSync("dist/main.js")) return;
  clearInterval(waitForBuild);
  const server = spawn(
    process.execPath,
    ["--env-file-if-exists=../.env", "--watch", "--enable-source-maps", "dist/main.js"],
    { stdio: "inherit" },
  );
  const stop = () => {
    server.kill();
    compile.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}, 500);
