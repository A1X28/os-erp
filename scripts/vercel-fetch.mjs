#!/usr/bin/env node
/**
 * Vercel file-deploy bootstrap: pull the public GitHub tree, then build.
 * Used only when the Vercel GitHub App cannot see the repo.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = join(tmpdir(), "os-erp-src");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const tarball =
  process.env.OS_ERP_TARBALL ??
  "https://codeload.github.com/A1X28/os-erp/tar.gz/refs/heads/main";

console.log("[os-erp] fetching", tarball);
execSync(`curl -fsSL "${tarball}" | tar -xz -C "${tmp}" --strip-components=1`, {
  stdio: "inherit",
});

const copies = [
  "src",
  "migrations",
  "scripts",
  "server",
  "public",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "vercel.json",
];
for (const name of copies) {
  const from = join(tmp, name);
  if (!existsSync(from)) continue;
  cpSync(from, join(process.cwd(), name), { recursive: true });
}

execSync("npm ci --include=dev", {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

execSync("node scripts/with-app-env.mjs vite build && node scripts/migrate.mjs", {
  stdio: "inherit",
  env: process.env,
});

pinFrankfurt(".vercel/output");

function pinFrankfurt(dir) {
  if (!existsSync(dir)) {
    console.log("[os-erp] no .vercel/output — skip region pin");
    return;
  }
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of readdirSync(cur)) {
      const p = join(cur, name);
      if (statSync(p).isDirectory()) {
        stack.push(p);
        continue;
      }
      if (name !== ".vc-config.json" && name !== "config.json") continue;
      try {
        const j = JSON.parse(readFileSync(p, "utf8"));
        j.regions = ["fra1"];
        writeFileSync(p, JSON.stringify(j, null, 2));
        console.log("[os-erp] pinned fra1 in", p);
      } catch (err) {
        console.log("[os-erp] skip", p, err instanceof Error ? err.message : err);
      }
    }
  }
}
