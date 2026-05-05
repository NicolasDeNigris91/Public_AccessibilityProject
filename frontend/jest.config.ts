import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    ".(css|scss)$": "<rootDir>/__mocks__/styleMock.js",
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "src/components/**/*.tsx",
    "!src/**/*.d.ts",
    // App router entrypoints are exercised by the e2e suite, not unit tests.
    "!src/app/**",
    "!src/components/AxeDev.tsx",
    "!src/components/ColorBlindFilters.tsx",
    "!src/components/shell/**",
  ],
  // No-regression baseline at the current measured numbers. Lift these as
  // tests land in Phase 1.4 (worker fixture, contract tests) and beyond.
  coverageThreshold: {
    global: { lines: 75, functions: 75, statements: 75, branches: 50 },
  },
};

export default config;
