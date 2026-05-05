module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    // server.ts and worker entrypoints are integration glue (network, signals,
    // process.exit). They are exercised in CI by the e2e flow, not Jest.
    "!src/server.ts",
    "!src/workers/**",
    "!src/infrastructure/db/mongo.ts",
    "!src/infrastructure/queue/**",
    "!src/interfaces/http/swagger.ts",
    "!src/config/**",
  ],
  coverageThreshold: {
    global: { lines: 80, functions: 80, statements: 80, branches: 75 },
  },
};
