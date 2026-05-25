const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_FILE = path.join(__dirname, "data", "lists.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const defaultData = {
  activeListId: "default",
  lists: [
    {
      id: "default",
      name: "My first list",
      icon: "📋",
      hideTitles: false,
      items: [
        { number: "1", title: "Pizza" },
        { number: "2", title: "Tacos" },
        { number: "3", title: "Sushi" },
        { number: "4", title: "Pasta" }
      ]
    }
  ]
};

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(normalizeData(data), null, 2));
}

function normalizeData(data) {
  const sourceLists = Array.isArray(data?.lists) ? data.lists : [];
  const seen = new Set();
  const lists = sourceLists
    .map((list, index) => {
      const id = String(list?.id || `list-${Date.now()}-${index}`);
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name: String(list?.name || "Untitled list").slice(0, 80),
        icon: normalizeListIcon(list?.icon),
        hideTitles: Boolean(list?.hideTitles),
        items: normalizeItems(list?.items)
      };
    })
    .filter(Boolean);

  if (!lists.length) {
    lists.push({ id: "default", name: "My first list", icon: "📋", hideTitles: false, items: [] });
  }

  const activeListId = lists.some((list) => list.id === data?.activeListId)
    ? data.activeListId
    : lists[0].id;

  return { activeListId, lists };
}

function normalizeListIcon(icon) {
  const icons = ["📋", "📚", "🎬", "🎲", "🍽️", "🛒", "🎁", "⭐", "💡", "🏠", "✈️", "🎮", "🎵", "🧩"];
  return icons.includes(icon) ? icon : icons[0];
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  const usedNumbers = new Set();
  return items
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          number: nextAvailableNumber(String(index + 1), usedNumbers),
          title: item.trim()
        };
      }

      const title = String(item?.title || "").trim();
      const requestedNumber = String(item?.number || index + 1).trim();
      return {
        number: nextAvailableNumber(requestedNumber, usedNumbers),
        title
      };
    })
    .filter((item) => item.title);
}

function nextAvailableNumber(requestedNumber, usedNumbers) {
  let number = requestedNumber || "1";
  if (!usedNumbers.has(number)) {
    usedNumbers.add(number);
    return number;
  }

  let candidate = 1;
  while (usedNumbers.has(String(candidate))) {
    candidate += 1;
  }
  usedNumbers.add(String(candidate));
  return String(candidate);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 2_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/api/lists" && request.method === "GET") {
      sendJson(response, 200, await readData());
      return;
    }

    if (request.url === "/api/lists" && request.method === "PUT") {
      const data = await readBody(request);
      await writeData(data);
      sendJson(response, 200, await readData());
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Something went wrong." });
  }
});

server.listen(PORT, HOST, () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${PORT}`);

  console.log(`Random Picker is running at http://localhost:${PORT}`);
  if (addresses.length) {
    console.log(`On another device on this network, try: ${addresses.join(", ")}`);
  }
});
