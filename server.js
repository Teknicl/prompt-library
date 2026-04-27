import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "prompt-library.sqlite"));
db.exec("PRAGMA foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    versions INTEGER NOT NULL DEFAULT 1,
    uses INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
if (!userColumns.includes("name")) {
  db.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
}

const seedCollections = [
  { name: "Writing", color: "blue" },
  { name: "Engineering", color: "green" },
  { name: "Research", color: "amber" },
  { name: "Support", color: "rose" },
  { name: "Operations", color: "violet" },
];

const seedPrompts = [
  {
    title: "Rewrite in brand voice",
    collection: "Writing",
    tags: ["voice", "editing"],
    body:
      "Rewrite the following copy in a crisp, helpful product voice. Keep the meaning intact, remove jargon, and make the ending feel actionable.\n\nCopy:\n{{copy}}",
    favorite: 1,
    versions: 5,
    uses: 42,
  },
  {
    title: "Debug React state",
    collection: "Engineering",
    tags: ["react", "debug"],
    body:
      "Act as a senior React engineer. Explain why this state behavior is happening, identify the smallest safe fix, and include a short test plan.\n\nCode:\n{{code}}",
    favorite: 1,
    versions: 7,
    uses: 31,
  },
  {
    title: "Customer interview synthesis",
    collection: "Research",
    tags: ["research", "summary"],
    body:
      "Synthesize these customer interview notes into themes, supporting quotes, product opportunities, and open questions. Be specific and avoid overgeneralizing.\n\nNotes:\n{{notes}}",
    favorite: 0,
    versions: 3,
    uses: 18,
  },
  {
    title: "Investor update",
    collection: "Operations",
    tags: ["update", "exec"],
    body:
      "Draft a concise investor update with sections for highlights, metrics, risks, asks, and next month. Keep the tone candid and confident.\n\nInputs:\n{{inputs}}",
    favorite: 0,
    versions: 4,
    uses: 12,
  },
  {
    title: "API docs explainer",
    collection: "Engineering",
    tags: ["docs", "api"],
    body:
      "Turn this API behavior into documentation for developers. Include a short overview, parameters, example request, example response, and common mistakes.\n\nDetails:\n{{details}}",
    favorite: 0,
    versions: 2,
    uses: 9,
  },
  {
    title: "Support reply tone",
    collection: "Support",
    tags: ["support", "tone"],
    body:
      "Write a support reply that acknowledges the issue, explains the next step plainly, and keeps the tone warm without overpromising.\n\nIssue:\n{{issue}}",
    favorite: 1,
    versions: 6,
    uses: 53,
  },
];

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, user) {
  const attempted = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const stored = Buffer.from(user.password_hash, "hex");
  return attempted.length === stored.length && timingSafeEqual(attempted, stored);
}

function createSession(userId) {
  const token = randomUUID();
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
  return token;
}

function seedUser(userId) {
  const insertCollection = db.prepare("INSERT INTO collections (user_id, name, color) VALUES (?, ?, ?)");
  for (const collection of seedCollections) {
    insertCollection.run(userId, collection.name, collection.color);
  }

  const collectionRows = db.prepare("SELECT id, name FROM collections WHERE user_id = ?").all(userId);
  const collectionIds = new Map(collectionRows.map((collection) => [collection.name, collection.id]));
  const insertPrompt = db.prepare(`
    INSERT INTO prompts (user_id, collection_id, title, body, tags, favorite, versions, uses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const prompt of seedPrompts) {
    insertPrompt.run(
      userId,
      collectionIds.get(prompt.collection),
      prompt.title,
      prompt.body,
      JSON.stringify(prompt.tags),
      prompt.favorite,
      prompt.versions,
      prompt.uses,
    );
  }
}

function getUserFromRequest(request) {
  const auth = request.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  return db
    .prepare(
      `SELECT users.id, users.name, users.email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`,
    )
    .get(token);
}

function listData(userId) {
  const collections = db
    .prepare("SELECT id, name, color FROM collections WHERE user_id = ? ORDER BY id")
    .all(userId);
  const prompts = db
    .prepare(
      `SELECT prompts.*, collections.name AS collection, collections.color AS collection_color
       FROM prompts
       JOIN collections ON collections.id = prompts.collection_id
       WHERE prompts.user_id = ?
       ORDER BY prompts.updated_at DESC, prompts.id DESC`,
    )
    .all(userId)
    .map((prompt) => ({
      id: prompt.id,
      collectionId: prompt.collection_id,
      collection: prompt.collection,
      title: prompt.title,
      body: prompt.body,
      tags: JSON.parse(prompt.tags || "[]"),
      favorite: Boolean(prompt.favorite),
      archived: Boolean(prompt.archived),
      versions: prompt.versions,
      uses: prompt.uses,
      updated: formatDate(prompt.updated_at),
    }));

  return { collections, prompts };
}

function formatDate(value) {
  const date = new Date(`${value}Z`);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Now";
  if (diff < 86_400_000) return "Today";
  if (diff < 172_800_000) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function parseBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function requireUser(request, response) {
  const user = getUserFromRequest(request);
  if (!user) send(response, 401, { error: "Not authenticated" });
  return user;
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});

  try {
    const url = new URL(request.url, "http://localhost:8787");

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const { name = "", email = "", password = "" } = await parseBody(request);
      if (!name.trim()) {
        return send(response, 400, { error: "Name is required." });
      }
      if (!email.trim() || password.length < 6) {
        return send(response, 400, { error: "Use an email and a password with at least 6 characters." });
      }
      const { hash, salt } = hashPassword(password);
      const result = db
        .prepare("INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)")
        .run(name.trim(), email.trim(), hash, salt);
      seedUser(result.lastInsertRowid);
      const token = createSession(result.lastInsertRowid);
      return send(response, 201, {
        token,
        user: { id: result.lastInsertRowid, name: name.trim(), email: email.trim() },
        ...listData(result.lastInsertRowid),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const { email = "", password = "" } = await parseBody(request);
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim());
      if (!user || !verifyPassword(password, user)) return send(response, 401, { error: "Email or password is incorrect." });
      const token = createSession(user.id);
      return send(response, 200, { token, user: { id: user.id, name: user.name || user.email, email: user.email }, ...listData(user.id) });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = (request.headers.authorization ?? "").replace("Bearer ", "");
      if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return send(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      const user = requireUser(request, response);
      if (!user) return;
      return send(response, 200, { user, ...listData(user.id) });
    }

    const user = requireUser(request, response);
    if (!user) return;

    if (request.method === "POST" && url.pathname === "/api/collections") {
      const { name = "" } = await parseBody(request);
      const trimmed = name.trim();
      if (!trimmed) return send(response, 400, { error: "Collection name is required." });
      const colors = ["blue", "green", "amber", "rose", "violet"];
      const count = db.prepare("SELECT COUNT(*) AS count FROM collections WHERE user_id = ?").get(user.id).count;
      db.prepare("INSERT INTO collections (user_id, name, color) VALUES (?, ?, ?)").run(user.id, trimmed, colors[count % colors.length]);
      return send(response, 201, listData(user.id));
    }

    const collectionDelete = url.pathname.match(/^\/api\/collections\/(\d+)$/);
    if (request.method === "DELETE" && collectionDelete) {
      const collectionId = Number(collectionDelete[1]);
      const remaining = db.prepare("SELECT id FROM collections WHERE user_id = ? AND id != ? ORDER BY id").all(user.id, collectionId);
      if (!remaining.length) {
        db.prepare("INSERT INTO collections (user_id, name, color) VALUES (?, ?, ?)").run(user.id, "General", "blue");
      }
      const fallback = db.prepare("SELECT id FROM collections WHERE user_id = ? AND id != ? ORDER BY id LIMIT 1").get(user.id, collectionId);
      db.prepare("UPDATE prompts SET collection_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND collection_id = ?").run(
        fallback.id,
        user.id,
        collectionId,
      );
      db.prepare("DELETE FROM collections WHERE user_id = ? AND id = ?").run(user.id, collectionId);
      return send(response, 200, listData(user.id));
    }

    if (request.method === "POST" && url.pathname === "/api/prompts") {
      const { collectionId } = await parseBody(request);
      const collection = db.prepare("SELECT id FROM collections WHERE user_id = ? AND id = ?").get(user.id, collectionId);
      const fallback = collection ?? db.prepare("SELECT id FROM collections WHERE user_id = ? ORDER BY id LIMIT 1").get(user.id);
      db.prepare(
        `INSERT INTO prompts (user_id, collection_id, title, body, tags)
         VALUES (?, ?, 'Untitled prompt', 'Describe the task, context, desired output, constraints, and examples.\n\nInput:\n{{input}}', '["draft"]')`,
      ).run(user.id, fallback.id);
      return send(response, 201, listData(user.id));
    }

    const promptRoute = url.pathname.match(/^\/api\/prompts\/(\d+)$/);
    if (promptRoute && request.method === "PATCH") {
      const promptId = Number(promptRoute[1]);
      const body = await parseBody(request);
      const current = db.prepare("SELECT * FROM prompts WHERE user_id = ? AND id = ?").get(user.id, promptId);
      if (!current) return send(response, 404, { error: "Prompt not found." });
      const next = {
        title: body.title ?? current.title,
        body: body.body ?? current.body,
        collectionId: body.collectionId ?? current.collection_id,
        tags: body.tags ? JSON.stringify(body.tags) : current.tags,
        favorite: body.favorite === undefined ? current.favorite : Number(Boolean(body.favorite)),
        archived: body.archived === undefined ? current.archived : Number(Boolean(body.archived)),
        versions: body.versions ?? current.versions,
        uses: body.uses ?? current.uses,
      };
      db.prepare(
        `UPDATE prompts
         SET title = ?, body = ?, collection_id = ?, tags = ?, favorite = ?, archived = ?, versions = ?, uses = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND id = ?`,
      ).run(
        next.title,
        next.body,
        next.collectionId,
        next.tags,
        next.favorite,
        next.archived,
        next.versions,
        next.uses,
        user.id,
        promptId,
      );
      return send(response, 200, listData(user.id));
    }

    if (promptRoute && request.method === "DELETE") {
      db.prepare("DELETE FROM prompts WHERE user_id = ? AND id = ?").run(user.id, Number(promptRoute[1]));
      return send(response, 200, listData(user.id));
    }

    return send(response, 404, { error: "Not found" });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return send(response, 409, { error: "That email or collection name already exists." });
    }
    console.error(error);
    return send(response, 500, { error: "Something went wrong." });
  }
}).listen(8787, "0.0.0.0", () => {
  console.log("Prompt Library API running at http://localhost:8787");
});
