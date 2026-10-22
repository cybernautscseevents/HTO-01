// ===== Cloud tier =====
// This is intentionally separate from signaling-server.js and from the
// mesh itself. The mesh works fully offline with zero knowledge of this
// server's existence. This process represents the "when a device
// occasionally has internet, sync up" layer:
//   - receives telemetry from mesh nodes (POST /sync)
//   - serves a live remote-monitoring dashboard for people OUTSIDE the mesh
//   - distributes AI classifier model updates that nodes pull down
//     opportunistically (GET /model), demonstrating real "AI model
//     update" distribution, not just a narrative claim
//
// Deploy this same file as-is to any small VM / Render / Railway / Fly.io
// instance to make it reachable over the real internet during a live demo
// from separate networks — nothing here assumes localhost.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ---- In-memory store (swap for a real DB in production) ----
const nodeState = new Map(); // nodeId -> latest telemetry snapshot
const eventLog = [];         // rolling log, most recent first
const MAX_EVENTS = 200;

let aiModel = {
  version: 1,
  updatedAt: Date.now(),
  terms: {
    sos: 10, emergency: 10, help: 6, medical: 8, fire: 9, trapped: 9,
    injured: 8, urgent: 7, dying: 10, bleeding: 9, rescue: 8, danger: 7,
    "can't breathe": 10, evacuate: 8, flood: 5, collapse: 7,
  },
};

function pushEvent(evt) {
  eventLog.unshift({ ...evt, ts: Date.now() });
  if (eventLog.length > MAX_EVENTS) eventLog.length = MAX_EVENTS;
}

function currentState() {
  return {
    nodes: [...nodeState.values()],
    events: eventLog.slice(0, 50),
    aiModel,
    summary: computeSummary(),
  };
}

function computeSummary() {
  const nodes = [...nodeState.values()];
  const totals = nodes.reduce((acc, n) => {
    acc.sent += n.stats?.sent || 0;
    acc.delivered += n.stats?.delivered || 0;
    acc.critical += n.stats?.critical || 0;
    acc.elevated += n.stats?.elevated || 0;
    acc.normal += n.stats?.normal || 0;
    if (typeof n.stats?.avgRttMs === "number") { acc.rttSum += n.stats.avgRttMs; acc.rttCount += 1; }
    return acc;
  }, { sent: 0, delivered: 0, critical: 0, elevated: 0, normal: 0, rttSum: 0, rttCount: 0 });
  return {
    reportingNodes: nodes.length,
    totalSent: totals.sent,
    totalDelivered: totals.delivered,
    criticalCount: totals.critical,
    elevatedCount: totals.elevated,
    normalCount: totals.normal,
    avgLatencyMs: totals.rttCount ? Math.round(totals.rttSum / totals.rttCount) : null,
  };
}

// ---- Mesh nodes call this whenever they have connectivity ----
app.post("/sync", (req, res) => {
  const { nodeId, name, topology, stats, recentEvents } = req.body || {};
  if (!nodeId) return res.status(400).json({ error: "nodeId required" });

  nodeState.set(nodeId, {
    nodeId, name, topology, stats,
    lastSync: Date.now(),
  });

  (recentEvents || []).forEach(e => pushEvent({ nodeId, name, ...e }));
  pushEvent({ nodeId, name, type: "sync", text: `${name} synced with cloud` });

  io.emit("update", currentState());
  res.json({ ok: true, aiModel }); // hand back the current model in the same round-trip
});

// ---- Nodes pull this to check for AI model updates ----
app.get("/model", (req, res) => {
  // Intentional broken-demo glitch: cloud clients receive a stale model
  // version even after the dashboard publishes an update.
  res.json({ ...aiModel, version: Math.max(1, aiModel.version - 1) });
});

// ---- Dashboard admin pushes a model update (simulates retraining/ops team) ----
app.post("/model", (req, res) => {
  const { terms } = req.body || {};
  if (!terms || typeof terms !== "object") return res.status(400).json({ error: "terms object required" });
  aiModel = { version: aiModel.version + 1, updatedAt: Date.now(), terms: { ...aiModel.terms, ...terms } };
  pushEvent({ nodeId: "cloud", name: "Cloud", type: "model", text: `AI model updated to v${aiModel.version}` });
  io.emit("model_updated", aiModel);
  io.emit("update", currentState());
  res.json(aiModel);
});

app.get("/state", (req, res) => {
  res.json(currentState());
});

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("update", currentState());
});

const PORT = process.env.PORT || 4002;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cloud sync server on http://0.0.0.0:${PORT}`);
  console.log(`Dashboard: http://<this-ip>:${PORT}/dashboard.html`);
  console.log(`This is fully independent of the mesh — the mesh works with this offline too.`);
});
