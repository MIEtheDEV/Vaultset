import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // `server-only` throws by design outside an RSC bundle. Stub it so server
    // modules that import it (lib/sets/masterset) are unit-testable.
    "^server-only$": "<rootDir>/__mocks__/server-only.ts",
  },
};

export default createJestConfig(config);
