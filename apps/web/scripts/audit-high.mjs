#!/usr/bin/env node
// SEC-2.10: fail only on high/critical advisories.
//
// `pnpm audit --audit-level=high` does not do what it sounds like: pnpm's
// --audit-level only filters what gets PRINTED, not the exit code — pnpm
// audit exits 1 whenever ANY vulnerability exists, even a single "low" one.
// That would make this job permanently red over findings SEC-2.10 doesn't
// ask about. So: run the audit, read its own severity counts, and decide
// pass/fail from those instead of trusting the process exit code.
import { execSync } from "node:child_process";

let json;
try {
  // pnpm audit's exit code is not meaningful here (see above) — only stdout is.
  json = execSync("pnpm audit --json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 });
} catch (error) {
  // execSync throws on non-zero exit, but still hands back stdout.
  json = error.stdout?.toString() ?? "";
}

let report;
try {
  report = JSON.parse(json);
} catch {
  console.error("Could not parse `pnpm audit --json` output.");
  console.error(json.slice(0, 2000));
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities ?? {};
const high = counts.high ?? 0;
const critical = counts.critical ?? 0;

console.log("Dependency advisory counts:", counts);

if (high > 0 || critical > 0) {
  console.error(`\n${high + critical} high/critical advisory(ies) found. Run \`pnpm audit\` for details.`);
  process.exit(1);
}

console.log("No high or critical advisories.");
