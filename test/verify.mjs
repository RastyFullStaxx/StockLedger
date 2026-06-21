import { join } from "node:path";

import {
  createLogDirectory,
  findOpenPort,
  runCommand,
  startCommand,
  waitForHttp,
} from "./support/verify-tools.mjs";

const args = new Set(process.argv.slice(2));
const keepServerOnFailure = args.has("--keep-server-on-failure");
const skipBrowser = args.has("--skip-browser");
const cwd = process.cwd();
const logDirectory = createLogDirectory();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const port = skipBrowser ? null : await findOpenPort();
const url = port ? `http://127.0.0.1:${port}` : null;

let server = null;
let failed = false;

console.log(`[verify] logs: ${logDirectory}`);

try {
  await runCommand("unit tests", npmCommand, ["test"], {
    cwd,
    logFile: join(logDirectory, "unit-tests.log"),
  });

  await runCommand("production build", npmCommand, ["run", "build"], {
    cwd,
    logFile: join(logDirectory, "build.log"),
  });

  if (!skipBrowser) {
    server = startCommand("vite dev server", npmCommand, ["run", "dev", "--", "--port", String(port)], {
      cwd,
      logFile: join(logDirectory, "vite-dev.log"),
    });

    await waitForHttp(url, { timeoutMs: 20000, intervalMs: 250 });
    console.log(`[verify] dev server ready at ${url}`);

    await runCommand("browser smoke", npmCommand, ["run", "smoke:browser"], {
      cwd,
      env: {
        ...process.env,
        STOCKLEDGER_URL: url,
      },
      logFile: join(logDirectory, "browser-smoke.log"),
    });
  }

  console.log(`\n[verify] all checks passed`);
  console.log(`[verify] logs kept at ${logDirectory}`);
} catch (error) {
  failed = true;
  console.error(`\n[verify] failed: ${error.message}`);
  console.error(`[verify] logs kept at ${logDirectory}`);

  if (server && keepServerOnFailure) {
    console.error(`[verify] keeping dev server alive for debugging: ${url}`);
    console.error(`[verify] stop it manually when finished.`);
    process.exitCode = 1;
    await new Promise(() => {});
  }

  process.exitCode = 1;
} finally {
  if (server && (!failed || !keepServerOnFailure)) {
    await server.stop();
  }
}
