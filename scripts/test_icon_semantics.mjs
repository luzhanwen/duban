import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [reader, salon, companionChat, planSetup, iconSource] = await Promise.all([
  readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/BookSalon.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/BookCompanionChat.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ReadingPlanSetup.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ChineseIcon.jsx", import.meta.url), "utf8"),
]);

assert.match(reader, /name=\{completed \? "books" : "tea"\}/);
assert.match(reader, /name="complete"/);
assert.doesNotMatch(reader, /读伴有一问|交互原型/);
assert.doesNotMatch(reader, /name="seal"/);
assert.doesNotMatch(salon, /name="seal"/);
assert.doesNotMatch(companionChat, /name="seal"/);
assert.doesNotMatch(planSetup, /icon: "seal"/);

for (const iconName of ["complete", "tea", "companion"]) {
  assert.match(iconSource, new RegExp(`\\n  ${iconName}: \\(`));
}
assert.match(iconSource, /const paths = ICON_PATHS\[name\];/);
assert.match(iconSource, /if \(!paths\) return null;/);
assert.doesNotMatch(iconSource, /ICON_PATHS\[name\] \|\| ICON_PATHS\.seal/);

console.log("Icon semantics tests passed.");
