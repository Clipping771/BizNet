import { execSync } from "child_process";

// Bring the test database up to date and reseed it before any suite runs.
// `migrate deploy` creates the database if it does not exist yet.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const opts = { stdio: "inherit" as const, env: { ...process.env, DATABASE_URL: url } };
  execSync("npx prisma migrate deploy", opts);
  execSync("npx tsx prisma/seed.ts", opts);
}
