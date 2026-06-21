import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { createLogDirectory, waitForHttp } from "./support/verify-tools.mjs";

test("createLogDirectory falls back to /tmp when the platform temp root is missing", () => {
  const directory = createLogDirectory("stockledger-test", "/definitely/not/a/real/temp/root");

  assert.equal(directory.startsWith("/tmp/stockledger-test-"), true);
  assert.equal(existsSync(directory), true);
});

test("waitForHttp retries through temporary connection failures", async () => {
  let attempts = 0;

  const result = await waitForHttp("http://127.0.0.1:5173", {
    timeoutMs: 2000,
    intervalMs: 1,
    getStatus: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("ECONNREFUSED");
      return 204;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 204);
  assert.equal(attempts, 3);
});

test("waitForHttp reports the target URL when the server never appears", async () => {
  await assert.rejects(
    () =>
      waitForHttp("http://127.0.0.1:59999", {
        timeoutMs: 120,
        intervalMs: 1,
        getStatus: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    /Timed out waiting for http:\/\/127\.0\.0\.1:/,
  );
});
