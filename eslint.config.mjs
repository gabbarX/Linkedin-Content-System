import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // The Prisma client connects as a role with BYPASSRLS, so it sees every
  // user's rows. Ownership is enforced in application code, which only works
  // if every query goes through a repository that takes an explicit userId.
  // This makes reaching around that a build failure rather than a data leak.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message:
                "Do not instantiate PrismaClient. Import a repository from @/server/db/repositories instead — Prisma bypasses RLS, so ownership is only enforced by those functions.",
            },
          ],
          patterns: [
            {
              group: ["@/server/db/client", "**/server/db/client"],
              message:
                "The raw Prisma client bypasses RLS and sees every user's rows. Add a function to @/server/db/repositories, which takes an explicit userId, instead of importing the client here.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
