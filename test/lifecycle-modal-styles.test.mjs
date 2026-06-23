import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const surfaceTokens = readFileSync("src/styles/tokens/surface.css", "utf8");
const moduleStyles = readFileSync("src/styles/pages/modules.css", "utf8");
const composeStyles = readFileSync("src/styles/pages/compose.css", "utf8");
const layoutStyles = readFileSync("src/styles/layout.css", "utf8");

test("overlays use reusable dimming tokens", () => {
  assert.match(surfaceTokens, /--overlay-dim:\s*rgba\(3,\s*31,\s*26,\s*0\.(?:4|5|6)\d*\)/);
  assert.match(surfaceTokens, /--overlay-blur:\s*blur\(\d+px\)/);
  assert.match(moduleStyles, /\.modal-backdrop\s*\{[\s\S]*background:\s*var\(--overlay-dim\)/);
  assert.match(moduleStyles, /\.modal-backdrop\s*\{[\s\S]*backdrop-filter:\s*var\(--overlay-blur\)/);
  assert.match(layoutStyles, /\.assistant-overlay-dim\s*\{[\s\S]*background:\s*var\(--overlay-dim\)/);
  assert.match(layoutStyles, /\.assistant-overlay-dim\s*\{[\s\S]*backdrop-filter:\s*var\(--overlay-blur\)/);
});

test("lifecycle modals keep content padded and actions responsive", () => {
  assert.match(composeStyles, /\.lifecycle-modal-body\s*\{[\s\S]*padding:\s*18px\s+20px\s+20px/);
  assert.match(composeStyles, /\.lifecycle-preview\s*\{[\s\S]*margin:\s*2px\s+0\s+0/);
  assert.match(composeStyles, /\.lifecycle-warning\s*\{[\s\S]*margin:\s*0/);
  assert.match(composeStyles, /\.lifecycle-modal-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
});
