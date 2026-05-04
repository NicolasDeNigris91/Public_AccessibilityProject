/* Conventional Commits with project-specific scopes.
 * Allowed types align with what the existing log uses (see git log).
 * Scopes match the components in PULL_REQUEST_TEMPLATE.md.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "test",
        "docs",
        "build",
        "ci",
        "chore",
        "style",
        "revert",
        "deps",
        "sec",
      ],
    ],
    "scope-enum": [
      1,
      "always",
      [
        "api",
        "worker",
        "frontend",
        "backend",
        "queue",
        "domain",
        "infra",
        "ci",
        "deps",
        "docs",
        "readme",
        "github",
        "landing",
        "docker",
      ],
    ],
    "subject-case": [2, "never", ["upper-case", "pascal-case", "start-case"]],
    "header-max-length": [2, "always", 100],
  },
};
