import { readFileSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";

const SHEBANG = "#!/usr/bin/env bun\n";
const DIST = join(import.meta.dir, "..", "dist", "index.js");

const content = readFileSync(DIST, "utf-8");

chmodSync(DIST, 0o755);

// Only prepend if shebang is missing or wrong
if (content.startsWith(SHEBANG)) {
  console.log(`  postbuild: shebang OK → ${DIST}`);
} else {
  const cleaned = content.replace(/^#!.*\n?/, ""); // strip any existing shebang
  writeFileSync(DIST, SHEBANG + cleaned, "utf-8");
  console.log(`  postbuild: added shebang → ${DIST}`);
}
