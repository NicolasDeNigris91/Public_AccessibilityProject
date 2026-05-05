/**
 * Phase 5.3 — Soft-auth (magic-link) collections + indexes.
 *
 * Adds the indexes the application relies on for users / magiclinks /
 * sessions, plus the `audits.userId` index that backs the signed-in
 * variant of GET /api/audits. Idempotent: createIndex is a no-op when
 * the index already exists with the same spec (mongo names them
 * deterministically by key).
 *
 * The mongoose schemas register the same indexes via syncIndexes() in
 * dev convenience flows, but production never relies on syncIndexes —
 * this file is the source of truth.
 */

module.exports = {
  async up(db) {
    const users = db.collection("users");
    await users.createIndex({ email: 1 }, { unique: true, name: "users_email_unique" });

    const magiclinks = db.collection("magiclinks");
    await magiclinks.createIndex(
      { tokenHash: 1 },
      { unique: true, name: "magiclinks_tokenHash_unique" }
    );
    // TTL: mongo deletes documents whose `expiresAt` is in the past on the
    // next sweep (~60s cadence). Keeps the collection bounded without
    // application-side cleanup.
    await magiclinks.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "magiclinks_expiresAt_ttl" }
    );
    await magiclinks.createIndex(
      { email: 1, createdAt: -1 },
      { name: "magiclinks_email_createdAt_desc" }
    );

    const sessions = db.collection("sessions");
    await sessions.createIndex(
      { tokenHash: 1 },
      { unique: true, name: "sessions_tokenHash_unique" }
    );
    await sessions.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "sessions_expiresAt_ttl" }
    );
    await sessions.createIndex({ userId: 1 }, { name: "sessions_userId" });

    // Drives GET /api/audits when a session is present — list a user's
    // audits newest first across every device they've used.
    const audits = db.collection("audits");
    await audits.createIndex(
      { userId: 1, createdAt: -1 },
      { name: "audits_userId_createdAt_desc" }
    );
  },

  async down(db) {
    const drop = (col, name) =>
      db
        .collection(col)
        .dropIndex(name)
        .catch(() => undefined);
    await Promise.all([
      drop("users", "users_email_unique"),
      drop("magiclinks", "magiclinks_tokenHash_unique"),
      drop("magiclinks", "magiclinks_expiresAt_ttl"),
      drop("magiclinks", "magiclinks_email_createdAt_desc"),
      drop("sessions", "sessions_tokenHash_unique"),
      drop("sessions", "sessions_expiresAt_ttl"),
      drop("sessions", "sessions_userId"),
      drop("audits", "audits_userId_createdAt_desc"),
    ]);
  },
};
