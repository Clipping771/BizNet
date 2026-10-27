import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import reactPlugin from "eslint-plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", ".git/**"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    plugins: {
      react: reactPlugin,
    },
    rules: {
      // 1. Strict i18n rule: Block raw JSX string literals (enforces t("key"))
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          allowedStrings: [" ", "&nbsp;", "·", "/", "✓", "≠", "?", ":", ": ", "(", ")", "-", "—"],
          ignoreProps: true,
          noAttributeStrings: false,
        },
      ],
      // 2. Disallow direct prisma imports outside lib/repo, prisma, and scripts/tests
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='prisma']",
          message:
            "Direct prisma queries are forbidden outside lib/repo/*. Use repository functions from lib/repo/*.",
        },
      ],
    },
  },
  {
    // Allow direct prisma in repositories, scripts, migrations, tests, jobs, and seed
    files: [
      "lib/repo/**/*.ts",
      "prisma/**/*.ts",
      "scripts/**/*.ts",
      "tests/**/*.ts",
      "jobs/**/*.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    // Exclude test files from jsx-no-literals if needed
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.ts"],
    rules: {
      "react/jsx-no-literals": "off",
    },
  },
];

export default eslintConfig;
