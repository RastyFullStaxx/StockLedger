import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

export async function findOpenPort(host = "127.0.0.1") {
  const server = createServer();

  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error("Could not allocate an open port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function waitForHttp(url, { timeoutMs = 15000, intervalMs = 250, getStatus = httpStatus } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const statusCode = await getStatus(url);
      if (statusCode >= 200 && statusCode < 500) {
        return { ok: true, statusCode };
      }
      lastError = new Error(`HTTP ${statusCode}`);
    } catch (error) {
      lastError = error;
    }

    await delay(intervalMs);
  }

  const detail = lastError?.message ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${url}.${detail}`);
}

export function createLogDirectory(prefix = "stockledger-verify", baseDirectory = tmpdir()) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = existsSync(baseDirectory) ? baseDirectory : "/tmp";
  const directory = join(root, `${prefix}-${stamp}`);

  try {
    mkdirSync(directory, { recursive: true });
    return directory;
  } catch (error) {
    if (root === "/tmp") throw error;
    const fallback = join("/tmp", `${prefix}-${stamp}`);
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export async function runCommand(label, command, args, { env = process.env, cwd = process.cwd(), logFile } = {}) {
  const log = logFile ? createWriteStream(logFile, { flags: "a" }) : null;
  const startedAt = Date.now();

  console.log(`\n[verify] ${label}`);
  console.log(`[verify] $ ${[command, ...args].join(" ")}`);

  const child = spawn(command, args, {
    cwd,
    env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    log?.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    log?.write(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  await closeLog(log);
  const durationMs = Date.now() - startedAt;

  if (exitCode !== 0) {
    const logHint = logFile ? ` See ${logFile}.` : "";
    throw new Error(`${label} failed with exit code ${exitCode}.${logHint}`);
  }

  console.log(`[verify] ${label} passed in ${(durationMs / 1000).toFixed(1)}s`);
  return { label, exitCode, durationMs };
}

export function startCommand(label, command, args, { env = process.env, cwd = process.cwd(), logFile } = {}) {
  const log = logFile ? createWriteStream(logFile, { flags: "a" }) : null;

  console.log(`\n[verify] starting ${label}`);
  console.log(`[verify] $ ${[command, ...args].join(" ")}`);

  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    log?.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    log?.write(chunk);
  });
  child.unref();

  return {
    child,
    label,
    logFile,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) {
        await closeLog(log);
        return;
      }

      killProcessTree(child, "SIGTERM");
      await waitForChildExit(child, 1000);

      if (child.exitCode === null && child.signalCode === null) {
        killProcessTree(child, "SIGKILL");
        await waitForChildExit(child, 1000);
      }

      child.stdout.destroy();
      child.stderr.destroy();
      await closeLog(log, 1000);
    },
  };
}

function httpStatus(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });

    request.setTimeout(2000, () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.once("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(child, signal) {
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs),
  ]);
}

function closeLog(log, timeoutMs = 0) {
  if (!log) return Promise.resolve();

  const closed = new Promise((resolve, reject) => {
    log.end((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  if (!timeoutMs) return closed;
  return Promise.race([closed, delay(timeoutMs)]);
}
