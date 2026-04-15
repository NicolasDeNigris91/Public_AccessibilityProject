import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\.(css|scss)$": "<rootDir>/__mocks__/styleMock.js",
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
};

export default config;
