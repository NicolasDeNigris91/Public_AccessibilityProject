import express from "express";
import request from "supertest";
import { basicAuth } from "./basicAuth";

function buildApp(user = "admin", pass = "supersecret") {
  const app = express();
  app.use(basicAuth({ user, pass, realm: "test" }));
  app.get("/", (_req, res) => res.status(200).send("ok"));
  return app;
}

function authHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("basicAuth", () => {
  it("returns 401 + WWW-Authenticate when no Authorization header is sent", async () => {
    const res = await request(buildApp()).get("/");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Basic realm="test"');
  });

  it("returns 401 when the header is not Basic scheme", async () => {
    const res = await request(buildApp()).get("/").set("authorization", "Bearer abc");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the decoded credential has no colon separator", async () => {
    const res = await request(buildApp())
      .get("/")
      .set("authorization", `Basic ${Buffer.from("nocolon", "utf8").toString("base64")}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the user is wrong", async () => {
    const res = await request(buildApp())
      .get("/")
      .set("authorization", authHeader("guest", "supersecret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the password is wrong", async () => {
    const res = await request(buildApp())
      .get("/")
      .set("authorization", authHeader("admin", "wrongpass"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the user is a prefix of the configured user (length-equality guard)", async () => {
    const res = await request(buildApp("admin", "p"))
      .get("/")
      .set("authorization", authHeader("ad", "p"));
    expect(res.status).toBe(401);
  });

  it("passes through to the next handler with valid credentials", async () => {
    const res = await request(buildApp())
      .get("/")
      .set("authorization", authHeader("admin", "supersecret"));
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });

  it("uses the configured realm in the challenge", async () => {
    const app = express();
    app.use(basicAuth({ user: "u", pass: "pp", realm: "Bull-Board" }));
    app.get("/", (_req, res) => res.send("ok"));
    const res = await request(app).get("/");
    expect(res.headers["www-authenticate"]).toBe('Basic realm="Bull-Board"');
  });

  it("defaults the realm to 'admin' when not provided", async () => {
    const app = express();
    app.use(basicAuth({ user: "u", pass: "pp" }));
    app.get("/", (_req, res) => res.send("ok"));
    const res = await request(app).get("/");
    expect(res.headers["www-authenticate"]).toBe('Basic realm="admin"');
  });
});
