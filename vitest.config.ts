import { defineConfig } from "vitest/config";
import fs from "fs";
import path from "path";

function readDotEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

// Tests never touch the dev database: they run against TEST_DATABASE_URL
// (default: the "biznet_test" database next to DATABASE_URL).
const env = readDotEnv(path.resolve(__dirname, ".env"));
const devUrl = process.env.DATABASE_URL || env.DATABASE_URL || "";
const testUrl =
  process.env.TEST_DATABASE_URL ||
  env.TEST_DATABASE_URL ||
  devUrl.replace(/\/[^/?]+(\?|$)/, "/biznet_test$1");

if (!testUrl || testUrl === devUrl) {
  throw new Error("TEST_DATABASE_URL must point to a separate test database");
}
// Read by tests/global-setup.ts, which runs in this process.
process.env.TEST_DATABASE_URL = testUrl;

export default defineConfig({
  // Same JSX runtime as Next.js, so components can be rendered in tests.
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 120000,
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // All suites share one database; run files one at a time so cleanup in one
    // suite can never race with assertions in another.
    fileParallelism: false,
    env: { ...env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
