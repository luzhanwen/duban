import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldUseNativeCompanionTransition } from "../src/lib/companionTransition.js";

assert.equal(
  shouldUseNativeCompanionTransition({ tauri: true, nativeApiAvailable: true }),
  false,
  "Tauri must not snapshot the whole reading surface with the native View Transition API"
);
assert.equal(
  shouldUseNativeCompanionTransition({ tauri: false, nativeApiAvailable: true }),
  true,
  "Browsers with a stable native API should retain shared-element transitions"
);
assert.equal(
  shouldUseNativeCompanionTransition({ tauri: false, nativeApiAvailable: false }),
  false,
  "Browsers without the native API must use the localized fallback"
);

const readerSource = await readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
assert.doesNotMatch(readerSource, /pageTurnCompanionFlight|page-turn-companion-flight/);
assert.match(readerSource, /setCompanionArrivalActive\(true\)/);
assert.match(readerSource, /companionArriving/);
assert.match(cssSource, /reader-companion-side-arrive/);
assert.match(cssSource, /is-opening-transition \.reader-sidebar-shell/);

console.log("Companion transition runtime tests passed.");
