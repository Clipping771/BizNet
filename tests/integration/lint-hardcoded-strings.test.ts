import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

describe("Phase 1: ESLint Strict i18n & Repo Isolation Rules", () => {
  it("should fail linting when a component has a hard-coded JSX string", async () => {
    const eslint = new ESLint();

    // Code with a hard-coded string in JSX
    const invalidJsxCode = `
      export default function TestPage() {
        return <div>Hardcoded string without t function</div>;
      }
    `;

    const results = await eslint.lintText(invalidJsxCode, {
      filePath: "app/test-hardcoded-page.tsx",
    });

    const hasNoLiteralsError = results.some((r) =>
      r.messages.some((m) => m.ruleId === "react/jsx-no-literals")
    );

    expect(hasNoLiteralsError).toBe(true);
  });

  it("should pass linting when text is passed through translation key or permitted symbol", async () => {
    const eslint = new ESLint();

    const validJsxCode = `
      export default function TestPage({ t }: { t: (k: string) => string }) {
        return <div>{t("app.title")}</div>;
      }
    `;

    const results = await eslint.lintText(validJsxCode, {
      filePath: "app/test-valid-page.tsx",
    });

    const hasNoLiteralsError = results.some((r) =>
      r.messages.some((m) => m.ruleId === "react/jsx-no-literals")
    );

    expect(hasNoLiteralsError).toBe(false);
  });

  it("should fail linting when direct prisma queries are called in app/ routes", async () => {
    const eslint = new ESLint();

    const invalidPrismaCode = `
      import { prisma } from "@/lib/prisma";
      export async function getData() {
        return prisma.business.findMany();
      }
    `;

    const results = await eslint.lintText(invalidPrismaCode, {
      filePath: "app/api/test-direct-prisma/route.ts",
    });

    const hasRestrictedSyntaxError = results.some((r) =>
      r.messages.some((m) => m.ruleId === "no-restricted-syntax")
    );

    expect(hasRestrictedSyntaxError).toBe(true);
  });
});
