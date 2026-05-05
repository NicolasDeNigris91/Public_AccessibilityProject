/**
 * Baseline migration: create the indexes the application relies on. Idempotent
 * because createIndex is a no-op when the index already exists with the same
 * spec (mongo names them deterministically by key).
 *
 * Going forward, every Mongoose schema change that adds, drops, or renames a
 * field or index ships with a migration here. The application no longer
 * relies on Mongoose's syncIndexes() to retrofit production.
 */

module.exports = {
  async up(db) {
    const audits = db.collection("audits");

    // Public id is the share token; must be unique.
    await audits.createIndex({ publicId: 1 }, { unique: true, name: "audits_publicId_unique" });

    // Drives GET /api/audits — list a client's audits newest first.
    await audits.createIndex(
      { clientId: 1, createdAt: -1 },
      { name: "audits_clientId_createdAt_desc" }
    );
  },

  async down(db) {
    const audits = db.collection("audits");
    await Promise.all([
      audits.dropIndex("audits_publicId_unique").catch(() => {}),
      audits.dropIndex("audits_clientId_createdAt_desc").catch(() => {}),
    ]);
  },
};
