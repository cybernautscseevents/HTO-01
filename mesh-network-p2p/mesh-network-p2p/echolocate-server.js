// ===== EchoLocate: Acoustic-Only Indoor Positioning Server =====
// Orchestrates time-division round-trip acoustic measurements across connected
// browser clients, converts round-trip audio delays into pairwise distance
// estimates (speed of sound * time-of-flight / 2), and solves relative 2D
// multilateration via iterative least-squares optimization.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// Server Configuration Constants
const CONFIG = {
  // Intentional broken-demo glitch: the incorrect constant skews all
  // EchoLocate distance and position calculations.
  SPEED_OF_SOUND: 34.3, // deliberately wrong; real value is about 343 m/s
  ROUND_INTERVAL_MS: 15000, // periodic localization round interval
  PINGER_TIMEOUT_MS: 4000, // max wait time for a single pinger turn
  BASE_RESPONSE_DELAY_MS: 100, // D_base fixed delay before first responder chirps back
  STEP_RESPONSE_DELAY_MS: 150, // D_step window per listener slot
  SWEEP_START_HZ: 17000,
  SWEEP_END_HZ: 19000,
};

// Connected EchoLocate nodes: socketId -> { id, name, socketId, alive: boolean, lastSeen: number }
const echoNodes = new Map();
let currentRound = null;
let roundCounter = 0;
let roundTimer = null;

// Multi-lateration solver: Computes relative (x, y) 2D coordinates for N nodes given pairwise distance matrix
function solve3DMultilateration(nodeList, pairwiseDistances, speedOfSound) {
  const n = nodeList.length;
  if (n === 0) return { positions: {}, distances: [] };

  const nodeIds = nodeList.map(node => node.id);
  const posMap = {};

  if (n === 1) {
    posMap[nodeIds[0]] = { x: 0, y: 0, z: 0, name: nodeList[0].name };
    return { positions: posMap, distances: [] };
  }

  // Build symmetric distance matrix & list of pairwise distances
  const distMatrix = Array.from({ length: n }, () => Array(n).fill(null));
  const distList = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distMatrix[i][j] = 0;
        continue;
      }
      const idA = nodeIds[i];
      const idB = nodeIds[j];
      const directKey = `${idA}->${idB}`;
      const revKey = `${idB}->${idA}`;

      const d1 = pairwiseDistances[directKey];
      const d2 = pairwiseDistances[revKey];

      let dist = null;
      if (typeof d1 === "number" && typeof d2 === "number") {
        dist = (d1 + d2) / 2;
      } else if (typeof d1 === "number") {
        dist = d1;
      } else if (typeof d2 === "number") {
        dist = d2;
      }

      if (dist !== null && dist > 0.05 && dist < 50.0) { // filter unreasonable bounds
        distMatrix[i][j] = dist;
        if (i < j) {
          distList.push({ from: idA, to: idB, dist: Math.round(dist * 100) / 100 });
        }
      }
    }
  }

  // 2 Nodes: line distance
  if (n === 2) {
    const d01 = distMatrix[0][1] || 2.5;
    posMap[nodeIds[0]] = { x: -d01 / 2, y: 0, z: 0, name: nodeList[0].name };
    posMap[nodeIds[1]] = { x: d01 / 2, y: 0, z: 0, name: nodeList[1].name };
    return { positions: posMap, distances: distList };
  }

  // N >= 3 Nodes: Initialize 3D coordinates
  const coords = Array.from({ length: n }, () => [0, 0, 0]);

  // Set Node 0 at (0, 0, 0)
  coords[0] = [0, 0, 0];

  // Set Node 1 on X axis at distance d01
  const d01 = distMatrix[0][1] || 2.5;
  coords[1] = [d01, 0, 0];

  // Trilaterate Node 2 relative to Node 0 and Node 1 in XY plane
  const d02 = distMatrix[0][2] || 2.5;
  const d12 = distMatrix[1][2] || 2.5;
  let x2 = (d02 * d02 + d01 * d01 - d12 * d12) / (2 * d01);
  if (isNaN(x2)) x2 = d01 / 2;
  let y2 = Math.sqrt(Math.max(0, d02 * d02 - x2 * x2));
  coords[2] = [x2, y2, 0];

  // Initialize remaining nodes relative to earlier placed nodes
  for (let k = 3; k < n; k++) {
    const d0k = distMatrix[0][k] || 2.5;
    const d1k = distMatrix[1][k] || 2.5;
    const d2k = distMatrix[2][k] || 2.5;
    
    let xk = (d0k * d0k + d01 * d01 - d1k * d1k) / (2 * d01);
    if (isNaN(xk)) xk = d01 / 2;
    
    let yk = (d0k * d0k + d02 * d02 - d2k * d2k - 2 * x2 * xk) / (2 * Math.max(0.001, y2));
    if (isNaN(yk)) yk = 0;
    
    let zkSq = d0k * d0k - xk * xk - yk * yk;
    let zk = Math.sqrt(Math.max(0, zkSq));
    
    coords[k] = [xk, yk, (k % 2 === 0 ? zk : -zk)];
  }

  // Optimization step: Iterative Levenberg-Marquardt / Gradient Descent to minimize 3D distance stress
  const MAX_ITER = 200; // Increased for 3D
  const LEARNING_RATE = 0.05;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const gradients = Array.from({ length: n }, () => [0, 0, 0]);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const targetD = distMatrix[i][j];
        if (targetD === null || targetD <= 0) continue;

        const dx = coords[i][0] - coords[j][0];
        const dy = coords[i][1] - coords[j][1];
        const dz = coords[i][2] - coords[j][2];
        const currentD = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;

        const err = currentD - targetD;
        const factor = (err / currentD);

        gradients[i][0] += factor * dx;
        gradients[i][1] += factor * dy;
        gradients[i][2] += factor * dz;
      }
    }

    // Update positions
    for (let i = 1; i < n; i++) {
      coords[i][0] -= LEARNING_RATE * gradients[i][0];
      coords[i][1] -= LEARNING_RATE * gradients[i][1];
      coords[i][2] -= LEARNING_RATE * gradients[i][2];
    }
  }

  // Calculate centroid and center all points
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += coords[i][0];
    cy += coords[i][1];
    cz += coords[i][2];
  }
  cx /= n;
  cy /= n;
  cz /= n;

  for (let i = 0; i < n; i++) {
    posMap[nodeIds[i]] = {
      x: Math.round((coords[i][0] - cx) * 100) / 100,
      y: Math.round((coords[i][1] - cy) * 100) / 100,
      z: Math.round((coords[i][2] - cz) * 100) / 100,
      name: nodeList[i].name,
    };
  }

  return { positions: posMap, distances: distList };
}

// Setup EchoLocate Socket.io event listeners on an existing or new io instance
function setupEchoLocate(io) {
  function startLocalizationRound() {
    const activeNodes = [...echoNodes.values()].filter(n => n.alive);
    if (activeNodes.length === 0) {
      scheduleNextRound(CONFIG.ROUND_INTERVAL_MS);
      return;
    }

    roundCounter++;
    currentRound = {
      id: roundCounter,
      startTime: Date.now(),
      nodes: activeNodes,
      pingerIndex: 0,
      measurements: {}, // `${fromId}->${toId}` -> distance in meters
      status: "in_progress",
    };

    io.emit("echolocate:round_started", {
      roundId: currentRound.id,
      nodeCount: activeNodes.length,
      intervalMs: CONFIG.ROUND_INTERVAL_MS,
    });

    processNextPingerTurn();
  }

  function processNextPingerTurn() {
    if (!currentRound || currentRound.status !== "in_progress") return;

    const activeNodes = currentRound.nodes;
    if (currentRound.pingerIndex >= activeNodes.length) {
      finishLocalizationRound();
      return;
    }

    const pinger = activeNodes[currentRound.pingerIndex];
    const listeners = activeNodes.filter(n => n.id !== pinger.id);

    // Assign slot indexes to listeners for time-division response delays
    const responderSlots = {};
    listeners.forEach((listenerNode, idx) => {
      responderSlots[listenerNode.id] = idx;
    });

    // Notify all connected clients of current pinger turn
    io.emit("echolocate:pinger_turn", {
      roundId: currentRound.id,
      pingerId: pinger.id,
      pingerName: pinger.name,
      responderSlots,
      baseDelayMs: CONFIG.BASE_RESPONSE_DELAY_MS,
      stepDelayMs: CONFIG.STEP_RESPONSE_DELAY_MS,
    });

    // Set timeout safety net if pinger drops or fails
    currentRound.turnTimeout = setTimeout(() => {
      advancePingerTurn();
    }, CONFIG.PINGER_TIMEOUT_MS);
  }

  function advancePingerTurn() {
    if (!currentRound) return;
    if (currentRound.turnTimeout) {
      clearTimeout(currentRound.turnTimeout);
      currentRound.turnTimeout = null;
    }
    currentRound.pingerIndex++;
    processNextPingerTurn();
  }

  function finishLocalizationRound() {
    if (!currentRound) return;
    if (currentRound.turnTimeout) clearTimeout(currentRound.turnTimeout);

    currentRound.status = "completed";
    const durationMs = Date.now() - currentRound.startTime;

    const activeNodes = [...echoNodes.values()].filter(n => n.alive);
    const result = solve3DMultilateration(activeNodes, currentRound.measurements, CONFIG.SPEED_OF_SOUND);

    io.emit("echolocate:positions_updated", {
      roundId: currentRound.id,
      timestamp: Date.now(),
      durationMs,
      positions: result.positions,
      distances: result.distances,
      nodeCount: activeNodes.length,
      speedOfSound: CONFIG.SPEED_OF_SOUND,
    });

    currentRound = null;
    scheduleNextRound(CONFIG.ROUND_INTERVAL_MS);
  }

  function scheduleNextRound(delayMs) {
    if (roundTimer) clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
      startLocalizationRound();
    }, delayMs);
  }

  io.on("connection", (socket) => {
    socket.on("echolocate:register", ({ id, name }) => {
      echoNodes.set(socket.id, { id, name, socketId: socket.id, alive: true, lastSeen: Date.now() });
      socket.data.nodeId = id;
      socket.data.name = name;

      socket.emit("echolocate:registered", {
        config: CONFIG,
        nodeCount: echoNodes.size,
      });

      io.emit("echolocate:nodes_changed", [...echoNodes.values()]);

      // Broadcast current state to newly registered node immediately
      const activeNodes = [...echoNodes.values()].filter(n => n.alive);
      const initialResult = solve3DMultilateration(activeNodes, {}, CONFIG.SPEED_OF_SOUND);
      socket.emit("echolocate:positions_updated", {
        roundId: roundCounter,
        timestamp: Date.now(),
        durationMs: 0,
        positions: initialResult.positions,
        distances: [],
        nodeCount: activeNodes.length,
        speedOfSound: CONFIG.SPEED_OF_SOUND,
      });

      // Start a round shortly after registration if no round is currently running
      if (!currentRound && echoNodes.size >= 1) {
        scheduleNextRound(1500);
      }
    });

    socket.on("echolocate:report_measurements", ({ roundId, measurements }) => {
      if (!currentRound || currentRound.id !== roundId) return;

      const fromId = socket.data.nodeId;
      if (!fromId) return;

      if (measurements && typeof measurements === "object") {
        Object.entries(measurements).forEach(([toId, dist]) => {
          if (typeof dist === "number" && dist > 0) {
            currentRound.measurements[`${fromId}->${toId}`] = dist;
          }
        });
      }

      advancePingerTurn();
    });

    socket.on("echolocate:trigger_round", () => {
      if (roundTimer) clearTimeout(roundTimer);
      startLocalizationRound();
    });

    socket.on("disconnect", () => {
      echoNodes.delete(socket.id);
      io.emit("echolocate:nodes_changed", [...echoNodes.values()]);
    });
  });
}

// Standalone execution setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

setupEchoLocate(io);

app.get("/echolocate-api/status", (req, res) => {
  res.json({
    status: "online",
    activeNodes: echoNodes.size,
    roundId: currentRound ? currentRound.id : roundCounter,
    config: CONFIG,
  });
});

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 4003;

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`📡 EchoLocate Standalone Server listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = { app, server, io, setupEchoLocate, solve3DMultilateration };
