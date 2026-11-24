// Prints turbo --filter flags for the workspace packages whose `typecheck`
// is not already covered by their `build`.
//
// A build covers typecheck only when both run tsc on the same tsconfig and
// typecheck just adds --noEmit. tsc then sees the same files with the same
// options and exits non-zero on the same errors. Any other package gets its
// typecheck run explicitly, so a new package or a changed script fails
// safe. Today that's the dashboard (`next build` skips type errors in
// *.test.* files) and tests/ (no build script).
//
// If nothing is covered, it prints nothing, and the workflow then runs
// every typecheck.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps", "packages"];
const dirs = [
  "tests",
  ...roots.flatMap((r) => readdirSync(r).map((d) => join(r, d))),
];

const flags = [];
for (const dir of dirs) {
  const file = join(dir, "package.json");
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const { build, typecheck } = pkg.scripts ?? {};
  if (!typecheck) continue;
  const tscOn = (cmd) => cmd?.match(/(?:^|&&\s*)tsc -p (\S+)(.*)$/);
  const b = tscOn(build);
  const t = tscOn(typecheck);
  const covered =
    b && t && b[1] === t[1] && b[2].trim() === "" && t[2].trim() === "--noEmit";
  if (!covered) flags.push(`--filter=${pkg.name}`);
}
process.stdout.write(flags.join(" "));
