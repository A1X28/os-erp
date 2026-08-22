#!/usr/bin/env node
/**
 * Vercel file-deploy bootstrap: pull the public GitHub tree, then build.
 * Used only when the Vercel GitHub App cannot see the repo.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

execSync("node scripts/with-app-env.mjs vite build && node scripts/migrate.mjs", {
  stdio: "inherit",
  env: process.env,
});
