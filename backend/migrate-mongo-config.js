// migrate-mongo config. Reads MONGO_URI from the same env the api/worker
// use, so `npm run migrate:up` works from any environment that already
// boots the app. Pass `MONGO_URI` explicitly in CI.

const { URL } = require("node:url");

const uri = process.env.MONGO_URI;
if (!uri) {
  // Fail fast: don't try to connect to a fallback that might be a wrong DB.
  // eslint-disable-next-line no-console
  console.error(
    "migrate-mongo: MONGO_URI is required. Set it in the environment that runs migrations."
  );
  process.exit(1);
}

// migrate-mongo wants the database name separately from the connection URI.
const dbName = new URL(uri).pathname.replace(/^\//, "") || "a11y";

module.exports = {
  mongodb: {
    url: uri,
    databaseName: dbName,
    options: {},
  },
  migrationsDir: "migrations",
  changelogCollectionName: "_migrations",
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: "commonjs",
};
