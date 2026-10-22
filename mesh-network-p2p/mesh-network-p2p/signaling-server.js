// ===== Signaling server for the P2P mesh =====
// IMPORTANT: this server does NOT route messages and does NOT compute
// topology or AI decisions. Its only job is to (a) introduce new peers to
// each other and (b) relay WebRTC offer/answer/ICE handshake packets so
// browsers can open a DIRECT connection. Once a connection is open, this
// server is completely out of the data path — kill it mid-demo and
// already-connected nodes keep routing messages to each other.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));

// In-memory store for PulseSeeker survivor beacons
const survivorBeacons = [];

// Mount Lifeboat Priority Queue Services
const { LethalityCalculator } = require("./lethality-calculator");
const { LifeboatPriorityQueue } = require("./priority-queue");
const lifeboatCalculator = new LethalityCalculator();
const lifeboatQueue = new LifeboatPriorityQueue({ maxSize: 10000 });
const lifeboatAlertLog = [];

// ---- Cloud Telemetry & AI Model Ops Store ----
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

app.post("/api/auto-beacon", (req, res) => {
  const beacon = req.body || {};
  const beaconEntry = {
    beaconId: `beacon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    receivedAt: Date.now(),
    ...beacon,
  };
  survivorBeacons.unshift(beaconEntry);
  if (survivorBeacons.length > 100) survivorBeacons.length = 100;

  console.log(`[PulseSeeker] 🆘 Emergency Survivor Beacon Received: ${beacon.type || 'unknown'} (${beacon.confidence || 0}% confidence)`);

  // Broadcast survivor alert to all connected sockets
  // Intentional broken-demo glitch: the event name has a typo, so connected
  // clients do not receive the survivor beacon notification reliably.
  io.emit("pulseseeker:beacon_recieved", beaconEntry);
  res.json({ success: true, beaconId: beaconEntry.beaconId, timestamp: beaconEntry.receivedAt });
});

app.get("/api/pulse-seeker/model", (req, res) => {
  res.json({
    version: "1.2.0-tinyml",
    modelUrl: "/api/pulse-seeker/model",
    inputFeatures: 25,
    outputClasses: ["tapping", "inertia", "normal", "noise"],
    quantized: true,
    sizeKb: 240
  });
});

// ===== Lifeboat Routing System Endpoints =====
app.post("/api/heartbeat", (req, res) => {
  try {
    const data = req.body || {};
    if (!data.deviceId) {
      return res.status(400).json({ error: "Missing required parameter: deviceId" });
    }

    const result = lifeboatCalculator.calculate(data);
    const queueResult = lifeboatQueue.enqueue({
      deviceId: data.deviceId,
      sensors: data.sensors,
      location: data.location,
      message: data.message || { text: data.text || "" },
      factors: result.factors
    }, result.score);

    res.json({
      ...result,
      deviceId: data.deviceId,
      queuePosition: queueResult.position,
      estimatedDelivery: queueResult.estimatedTime,
      queueId: queueResult.queueId,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("[Lifeboat Server Error]", err);
    res.status(500).json({ error: "Internal calculation error", message: err.message });
  }
});

app.get("/api/priority/queue", (req, res) => {
  try {
    res.json({
      success: true,
      stats: lifeboatQueue.getStats(),
      nextCritical: lifeboatQueue.queues.critical.slice(0, 5).map(e => ({
        id: e.id, deviceId: e.meta.deviceId, score: e.score, priority: e.priority, messageText: e.message.text, location: e.message.location, timestamp: e.timestamp
      }))
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch queue status", message: err.message });
  }
});

app.get("/api/priority/critical", (req, res) => {
  try {
    res.json({
      success: true,
      count: lifeboatQueue.queues.critical.length,
      criticalMessages: lifeboatQueue.queues.critical.map(e => ({
        id: e.id, deviceId: e.meta.deviceId, score: e.score, priority: e.priority, message: e.message, location: e.meta.location, factors: e.meta.factors, timestamp: e.timestamp
      }))
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch critical messages", message: err.message });
  }
});

app.post("/api/alert/send", (req, res) => {
  try {
    const { count } = req.body || {};
    const dequeued = lifeboatQueue.dequeue(typeof count === "number" ? count : 10);
    const dispatched = dequeued.map(e => {
      const item = { alertId: `alert-${Date.now()}`, id: e.id, deviceId: e.meta.deviceId, score: e.score, priority: e.priority, location: e.meta.location, messageText: e.message.text, dispatchedAt: Date.now() };
      lifeboatAlertLog.unshift(item);
      return item;
    });
    if (lifeboatAlertLog.length > 200) lifeboatAlertLog.length = 200;
    res.json({ success: true, dispatchedCount: dispatched.length, dispatchedAlerts: dispatched });
  } catch (err) {
    res.status(500).json({ error: "Failed to send emergency alerts", message: err.message });
  }
});

app.get("/api/priority/stats", (req, res) => {
  try {
    res.json({ success: true, stats: lifeboatQueue.getStats(), recentAlertsCount: lifeboatAlertLog.length, recentAlerts: lifeboatAlertLog.slice(0, 20), serverTimestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch queue statistics", message: err.message });
  }
});

// ===== Cloud Sync & AI Model Endpoints =====
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
  res.json({ ok: true, aiModel });
});

app.get("/model", (req, res) => {
  res.json(aiModel);
});

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

app.use((req, res) => {
  const distIndex = path.join(__dirname, "dist", "index.html");
  const publicIndex = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  res.send("CrisisLink / ZoneSync Backend Server Running");
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Attach EchoLocate acoustic positioning handlers to primary WebSocket server
try {
  const { setupEchoLocate } = require("./echolocate-server.js");
  setupEchoLocate(io);
} catch (err) {
  console.warn("Could not mount EchoLocate handlers:", err.message);
}

// registry: id -> { id, name, socketId }  (bootstrap directory only)
const registry = new Map();

io.on("connection", (socket) => {
  socket.emit("update", currentState());

  socket.on("register", ({ id, name }) => {
    registry.set(id, { id, name, socketId: socket.id });
    socket.data.nodeId = id;

    const others = [...registry.values()].filter((n) => n.id !== id);
    const shuffled = others.sort(() => Math.random() - 0.5);
    const suggestions = shuffled.slice(0, Math.min(2, shuffled.length));

    socket.emit("registered", { id, name, suggestions: suggestions.map(n => ({ id: n.id, name: n.name })) });
    socket.broadcast.emit("peer_available", { id, name });
  });

  socket.on("signal", ({ to, from, fromName, data }) => {
    const target = registry.get(to);
    if (target) {
      io.to(target.socketId).emit("signal", { from, fromName, data });
    }
  });

  socket.on("server_failover", (failoverMsg) => {
    io.emit("central_server_redirected", failoverMsg);
  });

  socket.on("disconnect", () => {
    const id = socket.data.nodeId;
    if (id) {
      registry.delete(id);
      socket.broadcast.emit("peer_left_directory", { id });
    }
  });
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZoneSync Unified Server running on http://0.0.0.0:${PORT}`);
});
