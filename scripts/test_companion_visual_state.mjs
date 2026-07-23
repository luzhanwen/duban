import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPANION_VISUAL_STATES,
  getCompanionVisualStateLabel,
  normalizeCompanionVisualState,
  resolveCompanionVisualState,
} from "../src/lib/companionVisualState.js";

assert.deepEqual(Object.values(COMPANION_VISUAL_STATES), [
  "preparing",
  "quiet",
  "answering",
  "waiting",
  "recording",
  "complete",
  "error",
  "offline",
]);

assert.equal(normalizeCompanionVisualState("answering"), "answering");
assert.equal(normalizeCompanionVisualState("random-expression"), "quiet");
assert.equal(resolveCompanionVisualState({ activity: "recording" }), "recording");
assert.equal(
  resolveCompanionVisualState({ activity: "answering", error: true }),
  "error",
  "真实错误必须优先于任务中的动效"
);
assert.equal(
  resolveCompanionVisualState({ activity: "answering", error: true, online: false }),
  "offline",
  "断网必须优先提供明确的离线降级"
);

for (const state of Object.values(COMPANION_VISUAL_STATES)) {
  assert.ok(getCompanionVisualStateLabel(state), `${state} 必须有可访问状态文案`);
}

const [reader, shell, avatar, styles] = await Promise.all([
  readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/CompanionShell.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ReadingCompanionAvatar.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

assert.match(reader, /visualState=\{getReaderCompanionVisualState/);
assert.match(reader, /visualError=\{getReaderCompanionVisualError/);
assert.match(reader, /COMPANION_VISUAL_STATES\.preparing/);
assert.match(reader, /COMPANION_VISUAL_STATES\.answering/);
assert.match(reader, /COMPANION_VISUAL_STATES\.recording/);
assert.match(reader, /COMPANION_VISUAL_STATES\.complete/);
assert.match(reader, /COMPANION_VISUAL_STATES\.quiet/);
assert.match(shell, /data-companion-online=\{online \? "true" : "false"\}/);
assert.match(shell, /当前离线，可以继续阅读；AI 功能将在网络恢复后可用。/);
assert.match(avatar, /data-companion-state=\{normalizedState\}/);
assert.match(styles, /\.reading-companion-avatar-art\.state-answering/);
assert.match(styles, /\.reading-companion-avatar-art\.state-preparing::after/);
assert.match(styles, /\.reading-companion-avatar-art\.state-recording/);
assert.match(styles, /\.reading-companion-avatar-art\.state-complete/);
assert.match(styles, /\.reading-companion-avatar-art\.state-offline/);
assert.doesNotMatch(
  styles,
  /\.reading-companion-avatar-art\.state-quiet[^}]*animation\s*:/s,
  "安静陪读状态不得启动动画"
);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);

console.log("Companion visual state tests passed.");
