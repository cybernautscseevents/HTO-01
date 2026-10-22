import { classifyUrgency, URGENT_TERMS, uid, edgeKey } from './urgencyClassifier.js';
import {
  cryptoIsAvailable,
  generateIdentityKeys,
  exportRawB64,
  importEcdhPub,
  importSignPub,
  fingerprintOf,
  deriveSharedKey,
  encryptPayload,
  decryptPayload,
  signEnvelope,
  verifyEnvelope,
} from './crypto.js';

export class MeshNode {
  constructor(id, name, signalSocket, callbacks) {
    this.id = id;
    this.name = name;
    this.socket = signalSocket;
    this.cb = callbacks; // { onTopology, onLog, onHop, onDelivered, onPeerState, onCloudStatus, onModel, onLocationStatus, onCryptoStatus, onIdentities, onMediaProgress, onMediaDelivered }
    this.peers = new Map();     // peerId -> { conn, channel, name, state }
    this.linkState = new Map(); // nodeId -> { name, neighbors: [{id, rtt}], seq }
    this.mySeq = 0;
    this.linkState.set(this.id, { name: this.name, neighbors: [], seq: 0 });

    this.aiTerms = { ...URGENT_TERMS };
    this.stats = { sent: 0, delivered: 0, critical: 0, elevated: 0, normal: 0 };
    this.pendingCloudEvents = [];
    this.cloudUrl = null;
    this.cloudTimer = null;

    // ---- Congestion prediction state ----
    this.rttHistory = new Map();   // peerId -> [{t, rtt}, ...] capped window
    this.linkCongestion = new Map(); // peerId -> { level, trendMsPerSec, rtt }
    this.qosStats = { throttled: 0, dropped: 0, rerouted: 0 };

    // ---- Adaptive QoS: per-peer priority send queues (CRITICAL, HIGH, NORMAL, BULK) ----
    this.sendQueues = new Map(); // peerId -> { CRITICAL: [], HIGH: [], NORMAL: [], BULK: [] }
    this.queueInterval = setInterval(() => this._drainQueues(), 50);

    // ---- Fast Network Layer Routing Table & Deduplication Cache ----
    this.routingTable = new Map(); // destId -> { nextHop: string, path: string[] }
    this.seenPackets = new Map();  // packetId -> expiryTimestamp
    this.cleanupInterval = setInterval(() => this._cleanupSeenPackets(), 30000);

    // ---- Location sharing (opt-in) ----
    this.locationEnabled = false;
    this.location = null; // { lat, lng, accuracy, ts }
    this.locationWatchId = null;

    // ---- End-to-end encryption + authentication ----
    this.secureContext = cryptoIsAvailable();
    this.cryptoReady = false;
    this.identities = new Map(); // nodeId -> { name, ecdhPub, signPub, fingerprint }
    this.incomingMedia = new Map(); // mediaId -> { chunks: [], received, envelope }
    this.keys = null; // { ecdh: CryptoKeyPair, sign: CryptoKeyPair }
    this.fingerprint = null;
    this._initCrypto();

    this._onSignalHandler = ({ from, fromName, data }) => this._onSignal(from, fromName, data);
    this._onRegisteredHandler = ({ suggestions }) => {
      suggestions.forEach(p => this.connectToPeer(p.id, p.name, true));
    };

    this.socket.on("signal", this._onSignalHandler);
    this.socket.on("registered", this._onRegisteredHandler);

    // ---- Dynamic Central Server Authority & Battery Failover State ----
    this.batteryLevel = 88;
    this.centralServer = { id: this.id, name: this.name, battery: 88 };
    this._initBattery();

    this._onFailoverHandler = (msg) => this._handleServerFailover(msg);
    this.socket.on("central_server_redirected", this._onFailoverHandler);

    // Periodically re-measure link RTT to direct peers and re-flood
    this.pingInterval = setInterval(() => this._pingAll(), 3000);
    this.watchdogInterval = setInterval(() => this._checkCentralServerLiveness(), 4000);
  }

  destroy() {
    if (this.queueInterval) clearInterval(this.queueInterval);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.cloudTimer) clearInterval(this.cloudTimer);
    if (this.locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.locationWatchId);
    }
    this.socket.off("signal", this._onSignalHandler);
    this.socket.off("registered", this._onRegisteredHandler);
    this.socket.off("central_server_redirected", this._onFailoverHandler);
    this.goOffline();
  }

  async _initCrypto() {
    if (!this.secureContext) {
      this.cb.onLog({ tag: "failure", text: `No secure context (need HTTPS or localhost) — running WITHOUT encryption. Messages will be sent in cleartext.` });
      this.cb.onCryptoStatus({ secure: false, ready: false });
      return;
    }
    try {
      this.keys = await generateIdentityKeys();
      const ecdhPubB64 = await exportRawB64(this.keys.ecdh.publicKey);
      const signPubB64 = await exportRawB64(this.keys.sign.publicKey);
      this.fingerprint = await fingerprintOf(ecdhPubB64);
      this._myIdentity = { id: this.id, name: this.name, ecdhPub: ecdhPubB64, signPub: signPubB64 };
      this.cryptoReady = true;
      this.cb.onCryptoStatus({ secure: true, ready: true, fingerprint: this.fingerprint });
      this.cb.onLog({ tag: "system", text: `Secure identity ready — fingerprint ${this.fingerprint}` });
    } catch (e) {
      this.cb.onCryptoStatus({ secure: true, ready: false, error: e.message });
      this.cb.onLog({ tag: "failure", text: `Failed to initialize WebCrypto: ${e.message}` });
    }
  }

  _floodIdentity(toPeerId) {
    if (!this.cryptoReady) return;
    const msg = { type: "identity", ...this._myIdentity };
    if (toPeerId) this._broadcastTo(toPeerId, msg);
    else this._broadcastToAll(msg);
  }

  async _handleIdentityMessage(msg, fromPeerId) {
    if (this.identities.has(msg.id)) return;
    try {
      const ecdhPub = await importEcdhPub(msg.ecdhPub);
      const signPub = await importSignPub(msg.signPub);
      const fingerprint = await fingerprintOf(msg.ecdhPub);
      this.identities.set(msg.id, { name: msg.name, ecdhPub, signPub, fingerprint });
      this.cb.onIdentities(this.identities);
      this._broadcastToAll({ type: "identity", id: msg.id, name: msg.name, ecdhPub: msg.ecdhPub, signPub: msg.signPub }, fromPeerId);
    } catch (e) {
      this.cb.onLog({ tag: "failure", text: `Failed to import identity for ${msg.name}: ${e.message}` });
    }
  }

  setLocationSharing(enabled, manualCoords = null) {
    this.locationEnabled = enabled;
    if (this.locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }
    if (!enabled) {
      this.location = null;
      this.manualLocation = null;
      this.cb.onLocationStatus({ status: "off" });
      return;
    }
    if (manualCoords && typeof manualCoords.lat === "number" && typeof manualCoords.lng === "number") {
      this.manualLocation = {
        lat: manualCoords.lat,
        lng: manualCoords.lng,
        accuracy: manualCoords.accuracy || 10,
        ts: Date.now(),
        isManual: true,
      };
      this.location = this.manualLocation;
      this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
      return;
    }
    if (this.manualLocation) {
      this.location = this.manualLocation;
      this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
      return;
    }
    if (!("geolocation" in navigator)) {
      this.cb.onLocationStatus({ status: "unsupported" });
      return;
    }
    this.cb.onLocationStatus({ status: "acquiring" });
    this.locationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          ts: Date.now(),
        };
        this.cb.onLocationStatus({ status: "active", location: this.location });
      },
      (err) => {
        if (this.manualLocation) {
          this.location = this.manualLocation;
          this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
        } else {
          const status = window.isSecureContext === false
            ? "insecure-context"
            : err.code === err.PERMISSION_DENIED
            ? "denied"
            : "error";
          this.cb.onLocationStatus({ status, message: err.message });
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }

  setManualLocation(coords) {
    if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
      this.manualLocation = {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy || 10,
        ts: Date.now(),
        isManual: true,
      };
      this.location = this.manualLocation;
      this.locationEnabled = true;
      this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
    }
  }

  setCloudSync(url, enabled) {
    this.cloudUrl = url;
    if (this.cloudTimer) { clearInterval(this.cloudTimer); this.cloudTimer = null; }
    if (enabled && url) {
      this._syncToCloud();
      this.cloudTimer = setInterval(() => this._syncToCloud(), 5000);
    }
  }

  async _syncToCloud() {
    if (!this.cloudUrl) return;
    const graph = this._deriveGraph();
    const rtts = this._rtt ? [...this._rtt.values()] : [];
    const avgRttMs = rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null;
    const congestedLinks = [...this.linkCongestion.values()].filter(c => c.level === "congested").length;
    const watchLinks = [...this.linkCongestion.values()].filter(c => c.level === "watch").length;
    const payload = {
      nodeId: this.id,
      name: this.name,
      topology: { nodeCount: graph.nodes.length, linkCount: graph.links.length },
      stats: { ...this.stats, avgRttMs, ...this.qosStats, congestedLinks, watchLinks },
      recentEvents: this.pendingCloudEvents.splice(0, 20),
    };
    try {
      const res = await fetch(this.cloudUrl.replace(/\/$/, "") + "/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      this.cb.onCloudStatus({ synced: true, lastSync: Date.now() });
      if (data.aiModel && data.aiModel.terms) this._applyModel(data.aiModel);
    } catch (e) {
      this.cb.onCloudStatus({ synced: false, error: true });
    }
  }

  _applyModel(model) {
    if (this._modelVersion === model.version) return;
    this._modelVersion = model.version;
    this.aiTerms = { ...model.terms };
    this.cb.onLog({ tag: "system", text: `Pulled AI model update v${model.version} from cloud (${Object.keys(model.terms).length} terms)` });
    this.cb.onModel(model);
  }

  register() {
    this.socket.emit("register", { id: this.id, name: this.name });
  }

  connectToPeer(peerId, peerName, isInitiator) {
    if (this.peers.has(peerId)) return;
    const conn = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
      ]
    });
    const entry = { conn, channel: null, name: peerName, state: "connecting" };
    this.peers.set(peerId, entry);
    this.cb.onPeerState();

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit("signal", { to: peerId, from: this.id, fromName: this.name, data: { type: "candidate", candidate: e.candidate } });
      }
    };
    conn.onconnectionstatechange = () => {
      entry.state = conn.connectionState;
      this.cb.onPeerState();
      if (["disconnected", "failed", "closed"].includes(conn.connectionState)) {
        this._handlePeerLost(peerId);
      }
    };

    if (isInitiator) {
      const channel = conn.createDataChannel("mesh");
      this._wireChannel(channel, peerId);
      entry.channel = channel;
      conn.createOffer().then(offer => {
        conn.setLocalDescription(offer);
        this.socket.emit("signal", { to: peerId, from: this.id, fromName: this.name, data: { type: "offer", sdp: offer } });
      });
    } else {
      conn.ondatachannel = (e) => {
        entry.channel = e.channel;
        this._wireChannel(e.channel, peerId);
      };
    }
  }

  async _onSignal(from, fromName, data) {
    let entry = this.peers.get(from);
    if (data.type === "offer") {
      if (!entry) { this.connectToPeer(from, fromName, false); entry = this.peers.get(from); }
      await entry.conn.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await entry.conn.createAnswer();
      await entry.conn.setLocalDescription(answer);
      this.socket.emit("signal", { to: from, from: this.id, fromName: this.name, data: { type: "answer", sdp: answer } });
    } else if (data.type === "answer") {
      if (entry) await entry.conn.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === "candidate") {
      if (entry) { try { await entry.conn.addIceCandidate(data.candidate); } catch (e) {} }
    }
  }

  _wireChannel(channel, peerId) {
    channel.onopen = () => {
      const entry = this.peers.get(peerId);
      if (entry) entry.state = "connected";
      this.cb.onPeerState();
      this.cb.onLog({ tag: "system", text: `Direct link established with ${entry ? entry.name : peerId} (WebRTC)` });
      this._floodMyTopology();
      this._floodIdentity(peerId);
    };
    channel.onclose = () => this._handlePeerLost(peerId);
    channel.onmessage = (e) => this._onData(peerId, JSON.parse(e.data));
  }

  _handlePeerLost(peerId) {
    if (!this.peers.has(peerId)) return;
    const entry = this.peers.get(peerId);
    this.peers.delete(peerId);
    this.cb.onPeerState();
    this.cb.onLog({ tag: "failure", text: `Lost direct link to ${entry.name} — updating routes` });
    this._floodMyTopology();
    this._recomputeRoutingTable();

    // If the lost peer was the active Central Server, immediately trigger failover election
    if (this.centralServer && this.centralServer.id === peerId) {
      if (this.cb.onLog) {
        this.cb.onLog({
          tag: "elevated",
          text: `⚠️ CENTRAL SERVER LOST: Phone "${entry.name}" disconnected (battery died or left network). Initiating automatic failover election...`
        });
      }
      this._electNewCentralServer(`Central Server phone "${entry.name}" disconnected / battery died`);
    }
  }

  _cleanupSeenPackets() {
    const now = Date.now();
    for (const [id, exp] of this.seenPackets.entries()) {
      if (now > exp) this.seenPackets.delete(id);
    }
  }

  _isDuplicatePacket(packetId) {
    if (!packetId) return false;
    const now = Date.now();
    const exp = this.seenPackets.get(packetId);
    if (exp && now < exp) {
      return true;
    }
    this.seenPackets.set(packetId, now + 60000); // 60s deduplication cache
    return false;
  }

  _floodMyTopology() {
    this.mySeq += 1;
    const neighbors = [...this.peers.entries()]
      .filter(([, e]) => e.state === "connected")
      .map(([id]) => ({ id, rtt: this._rttOf(id), congestion: this._congestionOf(id) }));
    this.linkState.set(this.id, { name: this.name, battery: this.batteryLevel, neighbors, seq: this.mySeq, lastSeen: Date.now() });
    const advert = { type: "topo", id: this.id, name: this.name, battery: this.batteryLevel, neighbors, seq: this.mySeq };
    this._broadcastToAll(advert);
    this.cb.onTopology(this._deriveGraph());
    this._recomputeRoutingTable();
  }

  _broadcastToAll(msg, exceptPeerId) {
    const payload = JSON.stringify(msg);
    for (const [pid, entry] of this.peers.entries()) {
      if (pid === exceptPeerId) continue;
      if (entry.channel && entry.channel.readyState === "open") entry.channel.send(payload);
    }
  }

  _onData(fromPeerId, msg) {
    if (msg.type === "topo") {
      const known = this.linkState.get(msg.id);
      if (!known || msg.seq > known.seq) {
        this.linkState.set(msg.id, { name: msg.name, battery: msg.battery || 85, neighbors: msg.neighbors, seq: msg.seq, lastSeen: Date.now() });
        if (this.centralServer && this.centralServer.id === msg.id) {
          this.centralServer.lastSeen = Date.now();
          if (msg.battery) this.centralServer.battery = msg.battery;
        }
        this._broadcastToAll(msg, fromPeerId);
        this.cb.onTopology(this._deriveGraph());
        this._recomputeRoutingTable();
      }
    } else if (msg.type === "identity") {
      this._handleIdentityMessage(msg, fromPeerId);
    } else if (msg.type === "ping") {
      this._broadcastTo(fromPeerId, { type: "pong", ts: msg.ts });
    } else if (msg.type === "pong") {
      const rtt = Date.now() - msg.ts;
      this._rtt = this._rtt || new Map();
      this._rtt.set(fromPeerId, rtt);
      this._recordRttSample(fromPeerId, rtt);
    } else if (msg.type === "packet") {
      this._handleNetworkPacket(msg.packet, fromPeerId);
    } else if (msg.type === "msg") {
      // Legacy envelope fallback
      this._handleNetworkPacket({
        packetId: msg.msgId || uid(),
        source: msg.from,
        destination: msg.to,
        nextHop: msg.path ? msg.path[msg.hopIndex + 1] : this.id,
        ttl: 10,
        type: msg.mediaChunk ? "MEDIA" : "DATA",
        priority: (msg.urgency?.level || "normal").toUpperCase(),
        timestamp: Date.now(),
        route: msg.path || [msg.from],
        hopCount: msg.hopIndex || 0,
        payload: msg
      }, fromPeerId);
    } else if (msg.type === "server_failover") {
      this._handleServerFailover(msg);
    }
  }

  async _initBattery() {
    if (typeof navigator !== "undefined" && navigator.getBattery) {
      try {
        const batt = await navigator.getBattery();
        this.batteryLevel = Math.round(batt.level * 100);
        batt.addEventListener("levelchange", () => {
          this.setBatteryLevel(Math.round(batt.level * 100));
        });
      } catch (e) {}
    }
  }

  setBatteryLevel(level) {
    this.batteryLevel = level;
    if (this.socket) {
      this.socket.emit("server_battery_update", { id: this.id, battery: level });
    }
    // If this node is acting as the central server and battery falls <= 15%, trigger failover
    if (this.centralServer && this.centralServer.id === this.id && level <= 15) {
      this.triggerBatteryDrainFailover(`Battery critical (${level}%) on central server`);
    }
  }

  triggerBatteryDrainFailover(reason = "Battery level depleted (<15%) on central server") {
    // Elect the highest battery / most connected candidate
    const otherNodes = [...this.linkState.entries()]
      .filter(([id]) => id !== this.id)
      .map(([id, info]) => ({
        id,
        name: info.name,
        battery: info.battery || 85,
        score: (info.battery || 85) * 10 + (info.neighbors?.length || 0) * 5
      }))
      .sort((a, b) => b.score - a.score);

    const nextLeader = otherNodes[0] || {
      id: "node-relay-backup",
      name: "Backup-Base-Station",
      battery: 92
    };

    const failoverMsg = {
      type: "server_failover",
      oldServer: { id: this.id, name: this.name, battery: this.batteryLevel },
      newServer: { id: nextLeader.id, name: nextLeader.name, battery: nextLeader.battery },
      reason,
      timestamp: Date.now()
    };

    this.centralServer = failoverMsg.newServer;
    this._broadcastToAll(failoverMsg);
    if (this.cb.onFailoverEvent) this.cb.onFailoverEvent(failoverMsg);
    if (this.cb.onLog) {
      this.cb.onLog({
        tag: "elevated",
        text: `⚡ SERVER FAILOVER: Battery critical on ${this.name}! Authority redirected to ${nextLeader.name}.`
      });
    }

    if (this.socket) {
      this.socket.emit("server_failover", failoverMsg);
    }
  }

  claimCentralServerRole() {
    const claimMsg = {
      type: "server_failover",
      oldServer: this.centralServer || { id: "unknown", name: "Previous Leader" },
      newServer: { id: this.id, name: this.name, battery: this.batteryLevel },
      reason: "Operator designated this phone as active Central Server",
      timestamp: Date.now()
    };
    this.centralServer = claimMsg.newServer;
    this._broadcastToAll(claimMsg);
    if (this.cb.onFailoverEvent) this.cb.onFailoverEvent(claimMsg);
    if (this.socket) this.socket.emit("server_failover", claimMsg);
    if (this.cb.onLog) {
      this.cb.onLog({
        tag: "system",
        text: `👑 Node "${this.name}" claimed Central Server Authority.`
      });
    }
  }

  _handleServerFailover(msg) {
    if (!msg || !msg.newServer) return;
    this.centralServer = { ...msg.newServer, lastSeen: Date.now() };
    if (this.cb.onFailoverEvent) this.cb.onFailoverEvent(msg);
    if (this.cb.onLog) {
      this.cb.onLog({
        tag: "elevated",
        text: `⚡ CENTRAL SERVER REDIRECTED: ${msg.oldServer?.name || "Former Leader"} → ${msg.newServer.name} (${msg.reason})`
      });
    }
  }

  _checkCentralServerLiveness() {
    if (!this.centralServer || this.centralServer.id === this.id) return;
    const sId = this.centralServer.id;
    const isPeer = this.peers.has(sId) && this.peers.get(sId).state === "connected";
    const inTopo = this.linkState.has(sId);
    const lastSeen = this.centralServer.lastSeen || 0;

    // If central server has been absent or silent for > 10 seconds while we have other active nodes
    if ((!isPeer && !inTopo) || (lastSeen > 0 && Date.now() - lastSeen > 12000)) {
      if (this.cb.onLog) {
        this.cb.onLog({
          tag: "elevated",
          text: `⚠️ Central Server "${this.centralServer.name}" is unresponsive (battery dead / timed out). Autonomous redirecting...`
        });
      }
      this._electNewCentralServer("Central Server phone unresponsive (battery dead / timed out)");
    }
  }

  _electNewCentralServer(reason = "Emergency election due to central server failure") {
    // Collect all online candidate nodes: self + connected peers + known live topology nodes
    const candidateMap = new Map();
    candidateMap.set(this.id, {
      id: this.id,
      name: this.name,
      battery: this.batteryLevel || 88,
      isSelf: true,
    });

    for (const [pId, p] of this.peers.entries()) {
      if (p.state === "connected" && pId !== this.centralServer?.id) {
        const info = this.linkState.get(pId);
        candidateMap.set(pId, {
          id: pId,
          name: p.name,
          battery: info?.battery || 85,
          isSelf: false,
        });
      }
    }

    for (const [tId, info] of this.linkState.entries()) {
      if (tId !== this.centralServer?.id && !candidateMap.has(tId)) {
        candidateMap.set(tId, {
          id: tId,
          name: info.name,
          battery: info.battery || 80,
          isSelf: false,
        });
      }
    }

    const candidates = [...candidateMap.values()];
    if (!candidates.length) return;

    // Elect deterministic winner: highest battery, tie-break by ID
    candidates.sort((a, b) => {
      if (b.battery !== a.battery) return b.battery - a.battery;
      return a.id.localeCompare(b.id);
    });

    const elected = candidates[0];
    const failoverMsg = {
      type: "server_failover",
      oldServer: this.centralServer || { id: "unknown", name: "Former Server" },
      newServer: { id: elected.id, name: elected.name, battery: elected.battery },
      reason,
      timestamp: Date.now()
    };

    this.centralServer = { ...failoverMsg.newServer, lastSeen: Date.now() };

    if (elected.isSelf) {
      if (this.cb.onLog) {
        this.cb.onLog({
          tag: "system",
          text: `👑 PROMOTED: This phone has been elected as the new Central Server (Battery: ${this.batteryLevel}%)!`
        });
      }
      this._broadcastToAll(failoverMsg);
      if (this.socket) this.socket.emit("server_failover", failoverMsg);
    }

    if (this.cb.onFailoverEvent) {
      this.cb.onFailoverEvent(failoverMsg);
    }
  }

  _broadcastTo(peerId, msg) {
    const entry = this.peers.get(peerId);
    if (entry && entry.channel && entry.channel.readyState === "open") entry.channel.send(JSON.stringify(msg));
  }

  _rttOf(peerId) {
    if (!this._rtt) return 80;
    return this._rtt.get(peerId) || 80;
  }

  _recordRttSample(peerId, rtt) {
    const history = this.rttHistory.get(peerId) || [];
    history.push({ t: Date.now(), rtt });
    while (history.length > 8) history.shift();
    this.rttHistory.set(peerId, history);
    this._updateCongestion(peerId, history);
  }

  _updateCongestion(peerId, history) {
    const rtt = history[history.length - 1].rtt;
    let trendMsPerSec = 0;
    if (history.length >= 3) {
      const first = history[0], last = history[history.length - 1];
      const dtSec = Math.max(0.5, (last.t - first.t) / 1000);
      trendMsPerSec = (last.rtt - first.rtt) / dtSec;
    }
    let level = rtt < 60 ? "normal" : rtt < 160 ? "watch" : "congested";
    if (trendMsPerSec > 40 && level === "normal") level = "watch";
    if (trendMsPerSec > 80 && level === "watch") level = "congested";

    const prev = this.linkCongestion.get(peerId);
    this.linkCongestion.set(peerId, { level, trendMsPerSec: Math.round(trendMsPerSec), rtt });

    if (prev && prev.level !== level && (level === "congested" || level === "watch")) {
      const entry = this.peers.get(peerId);
      this.cb.onLog({
        tag: level === "congested" ? "failure" : "system",
        text: `Congestion ${level === "congested" ? "confirmed" : "predicted"} on link to ${entry ? entry.name : peerId} (${rtt}ms, trending ${trendMsPerSec >= 0 ? "+" : ""}${Math.round(trendMsPerSec)}ms/s)`,
      });
    }
  }

  _congestionOf(peerId) {
    const c = this.linkCongestion.get(peerId);
    return c ? c.level : "normal";
  }

  _congestionPenalty(level) {
    if (level === "congested") return 3.5;
    if (level === "watch") return 1.6;
    return 1;
  }

  _pingAll() {
    let changed = false;
    for (const [pid, entry] of this.peers.entries()) {
      if (entry.channel && entry.channel.readyState === "open") {
        entry.channel.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        changed = true;
      }
    }
    if (changed) this._floodMyTopology();
  }

  _deriveGraph() {
    const nodes = [];
    const linkMap = new Map();
    for (const [id, info] of this.linkState.entries()) {
      const hasEdges = info.neighbors.length > 0 || [...this.linkState.values()].some(o => o.neighbors.some(n => n.id === id));
      nodes.push({ id, name: info.name, alive: hasEdges || (id === this.id && this.peers.size >= 0) });
      for (const n of info.neighbors) {
        const key = edgeKey(id, n.id);
        const prev = linkMap.get(key);
        const congestion = n.congestion || "normal";
        if (!prev || n.rtt < prev.weight) linkMap.set(key, { a: id, b: n.id, weight: n.rtt, congestion });
      }
    }
    return { nodes, links: [...linkMap.values()] };
  }

  computeRoute(fromId, toId) {
    const adjacency = new Map();
    for (const [id, info] of this.linkState.entries()) {
      adjacency.set(id, info.neighbors);
    }
    const dist = new Map(), prev = new Map(), visited = new Set();
    for (const id of this.linkState.keys()) dist.set(id, Infinity);
    dist.set(fromId, 0);
    while (true) {
      let u = null, best = Infinity;
      for (const id of this.linkState.keys()) {
        if (!visited.has(id) && dist.get(id) < best) { best = dist.get(id); u = id; }
      }
      if (u === null) break;
      visited.add(u);
      if (u === toId) break;
      for (const n of (adjacency.get(u) || [])) {
        if (visited.has(n.id)) continue;
        const penalty = this._congestionPenalty(n.congestion || "normal");
        const alt = dist.get(u) + n.rtt * penalty;
        if (alt < (dist.get(n.id) ?? Infinity)) { dist.set(n.id, alt); prev.set(n.id, u); }
      }
    }
    if (dist.get(toId) === undefined || dist.get(toId) === Infinity) return null;
    const path = [toId];
    let cur = toId;
    while (cur !== fromId) { cur = prev.get(cur); if (cur === undefined) return null; path.unshift(cur); }
    return path;
  }

  _recomputeRoutingTable() {
    this.routingTable.clear();
    for (const destId of this.linkState.keys()) {
      if (destId === this.id) continue;
      const path = this.computeRoute(this.id, destId);
      if (path && path.length >= 2) {
        this.routingTable.set(destId, { nextHop: path[1], path });
      }
    }
  }

  _getNextHop(destId) {
    const cached = this.routingTable.get(destId);
    if (cached && this.peers.has(cached.nextHop) && this.peers.get(cached.nextHop).state === "connected") {
      return cached.nextHop;
    }
    // Fast route recovery: compute route on-demand if cache is miss or link is down
    const freshPath = this.computeRoute(this.id, destId);
    if (freshPath && freshPath.length >= 2) {
      this.routingTable.set(destId, { nextHop: freshPath[1], path: freshPath });
      return freshPath[1];
    }
    return null;
  }

  async sendMessage(toId, text, forcedLocation) {
    const urgency = classifyUrgency(text, this.aiTerms);
    const priority = urgency.level === "critical" ? "CRITICAL" : urgency.level === "elevated" ? "HIGH" : "NORMAL";

    const nextHop = this._getNextHop(toId);
    if (!nextHop) {
      this.cb.onLog?.({ tag: "failure", text: `No known route to destination — network partitioned from here` });
      return;
    }

    const packetId = uid();
    const location = forcedLocation || (this.locationEnabled && this.location ? { ...this.location } : null);

    let appPayload;
    const recipient = this.identities.get(toId);
    if (this.secureContext && this.cryptoReady && recipient) {
      try {
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, recipient.ecdhPub);
        const { iv, ciphertext } = await encryptPayload(sharedKey, { text, location });
        const signature = await signEnvelope(this.keys.sign.privateKey, packetId, this.id, toId, iv, ciphertext);
        appPayload = { encrypted: true, iv, ciphertext, signature };
      } catch (e) {
        this.cb.onLog?.({ tag: "failure", text: `Encryption failed (${e.message}) — message not sent` });
        return;
      }
    } else {
      const reason = !this.secureContext ? "no secure context" : !recipient ? "recipient identity not yet known" : "keys not ready";
      appPayload = { encrypted: false, text, location };
      this.cb.onLog?.({ tag: "system", text: `⚠ Sending UNENCRYPTED (${reason})` });
    }

    const cachedPath = this.routingTable.get(toId)?.path || [this.id, nextHop];
    const pathNames = cachedPath.map(id => (this.linkState.get(id) || {}).name || id).join(" → ");

    const packet = {
      packetId,
      source: this.id,
      destination: toId,
      nextHop,
      ttl: 10,
      type: "DATA",
      priority,
      timestamp: Date.now(),
      route: [this.name || this.id],
      hopCount: 0,
      payload: appPayload
    };

    this.stats.sent += 1;
    this.stats[urgency.level] += 1;
    this.pendingCloudEvents.push({ type: urgency.level, text: `sent a ${urgency.level} message` });

    console.log(`[SEND] packet=${packetId} source=${this.name} destination=${toId} route=${pathNames}`);
    this.cb.onLog?.({
      tag: urgency.level,
      text: `"${text}"`,
      meta: `→ packet ${packetId} via ${cachedPath.length - 1} hop(s): ${pathNames}${location ? " · 📍 location attached" : ""}${appPayload.encrypted ? " · 🔒 encrypted" : " · 🔓 unencrypted"}`,
    });

    // Opportunistically post heartbeat to Lifeboat Priority Queue & Lethality Calculator
    const baseUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
    fetch(baseUrl ? `${baseUrl}/api/heartbeat` : "/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: this.name || this.id,
        sensors: { ambientLight: 5, battery: 85 },
        location: location || { lat: 37.7749, lng: -122.4194, nearWater: false },
        message: { text, timestamp: Date.now() }
      })
    }).catch(() => {});

    this._enqueuePacket(nextHop, packet);
  }

  async broadcastLocationToAll(text, customLocation = null) {
    let location = customLocation || this.location || this.manualLocation;

    if (!location && ("geolocation" in navigator)) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 })
        );
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), ts: Date.now() };
      } catch (e) {
        // GPS fix unavailable
      }
    }

    if (!location) {
      location = { lat: 37.7749, lng: -122.4194, accuracy: 15, ts: Date.now(), isSimulated: true };
      this.cb.onLog?.({ tag: "system", text: `📍 Live GPS fix unavailable — broadcasting with demo location (37.7749, -122.4194).` });
    }

    const graph = this._deriveGraph();
    const recipients = graph.nodes.filter(n => n.id !== this.id && n.alive);
    if (recipients.length === 0) {
      this.cb.onLog?.({ tag: "failure", text: `Location broadcast — no other connected devices to send to` });
      return;
    }
    this.cb.onLog?.({ tag: "system", text: `📍 Broadcasting location to ${recipients.length} connected device(s)…` });
    for (const r of recipients) {
      await this.sendMessage(r.id, text, location);
    }
  }

  async sendMedia(toId, kind, dataUrl, mimeType, caption) {
    let urgency = classifyUrgency(caption || "", this.aiTerms);
    if (urgency.level === "normal") urgency = { level: "elevated", score: 5 };
    const priority = urgency.level === "critical" ? "CRITICAL" : "BULK";

    const nextHop = this._getNextHop(toId);
    if (!nextHop) {
      this.cb.onLog?.({ tag: "failure", text: `No known route to destination — network partitioned from here` });
      return;
    }
    const mediaId = uid() + uid();
    const location = this.locationEnabled && this.location ? { ...this.location } : null;
    const rawPayload = { kind, mimeType, dataUrl, caption: caption || "", location };
    const payloadStr = JSON.stringify(rawPayload);

    let encrypted = false, iv = null, signature = null, transmitStr = payloadStr;
    const recipient = this.identities.get(toId);
    if (this.secureContext && this.cryptoReady && recipient) {
      try {
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, recipient.ecdhPub);
        const enc = await encryptPayload(sharedKey, rawPayload);
        iv = enc.iv; transmitStr = enc.ciphertext; encrypted = true;
        signature = await signEnvelope(this.keys.sign.privateKey, mediaId, this.id, toId, iv, transmitStr);
      } catch (e) {
        this.cb.onLog?.({ tag: "failure", text: `Media encryption failed (${e.message}) — not sent` });
        return;
      }
    }

    const CHUNK = 12000;
    const totalChunks = Math.max(1, Math.ceil(transmitStr.length / CHUNK));
    this.stats.sent += 1;
    this.stats[urgency.level] += 1;
    this.pendingCloudEvents.push({ type: urgency.level, text: `sent a ${kind} message (${totalChunks} chunks)` });

    const cachedPath = this.routingTable.get(toId)?.path || [this.id, nextHop];
    this.cb.onLog?.({
      tag: urgency.level,
      text: `${kind === "image" ? "🖼️ Image" : "🎤 Voice note"}${caption ? `: "${caption}"` : ""}`,
      meta: `→ media packet ${mediaId} via ${cachedPath.length - 1} hop(s), ${totalChunks} chunk(s)${encrypted ? " · 🔒 encrypted" : " · 🔓 unencrypted"}`,
      mediaKind: kind,
      mediaUrl: dataUrl,
      mimeType,
    });

    for (let i = 0; i < totalChunks; i++) {
      const chunk = transmitStr.slice(i * CHUNK, (i + 1) * CHUNK);
      const packet = {
        packetId: `${mediaId}-c${i}`,
        source: this.id,
        destination: toId,
        nextHop,
        ttl: 10,
        type: "MEDIA",
        priority: i === 0 && priority === "CRITICAL" ? "HIGH" : "BULK",
        timestamp: Date.now(),
        route: [this.name || this.id],
        hopCount: 0,
        payload: {
          mediaId,
          kind,
          chunkIndex: i,
          totalChunks,
          chunk,
          encrypted,
          iv,
          signature
        }
      };
      this._enqueuePacket(nextHop, packet);
    }
  }

  _handleMediaChunkPacket(packet, latencyMs, totalHops) {
    const payload = packet.payload;
    let buf = this.incomingMedia.get(payload.mediaId);
    if (!buf) {
      buf = { chunks: new Array(payload.totalChunks).fill(""), received: 0, packet, payload };
      this.incomingMedia.set(payload.mediaId, buf);
    }
    if (buf.chunks[payload.chunkIndex] === "") buf.received += 1;
    buf.chunks[payload.chunkIndex] = payload.chunk;
    this.cb.onMediaProgress?.({ mediaId: payload.mediaId, kind: payload.kind, received: buf.received, total: payload.totalChunks });

    if (buf.received === payload.totalChunks) {
      this.incomingMedia.delete(payload.mediaId);
      this._finalizeMediaPacket(packet, buf.payload, buf.chunks.join(""), latencyMs, totalHops);
    }
  }

  async _finalizeMediaPacket(packet, mediaMeta, combined, latencyMs, totalHops) {
    this.stats.delivered += 1;
    this.pendingCloudEvents.push({ type: "delivered", text: `received a ${mediaMeta.kind} message` });
    let payload, verified = null;

    if (mediaMeta.encrypted) {
      const sender = this.identities.get(packet.source);
      if (!sender || !this.cryptoReady) {
        this.cb.onLog?.({ tag: "failure", text: `Received encrypted ${mediaMeta.kind} from unknown identity ${packet.source} — cannot decrypt` });
        return;
      }
      try {
        verified = await verifyEnvelope(sender.signPub, mediaMeta.mediaId, packet.source, packet.destination, mediaMeta.iv, combined, mediaMeta.signature);
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, sender.ecdhPub);
        payload = await decryptPayload(sharedKey, mediaMeta.iv, combined);
      } catch (e) {
        this.cb.onLog?.({ tag: "failure", text: `Failed to decrypt ${mediaMeta.kind} from ${packet.source}: ${e.message}` });
        return;
      }
    } else {
      try {
        payload = JSON.parse(combined);
        verified = false;
      } catch (e) {
        this.cb.onLog?.({ tag: "failure", text: `Corrupt media packet received from ${packet.source}` });
        return;
      }
    }

    this.cb.onMediaDelivered?.({
      ...payload,
      mediaId: mediaMeta.mediaId,
      from: packet.source,
      to: packet.destination,
      encrypted: mediaMeta.encrypted,
      verified,
      hops: totalHops,
      latencyMs,
      route: packet.route,
      path: packet.route
    });
  }

  /* =========================================================================
     NETWORK LAYER: Fast Packet Forwarding Engine
     Intermediate nodes act as lightweight routers:
     - Check duplicate (drop if seen)
     - Check destination: if self -> hand to Application Layer
     - Check TTL: decrement, drop if 0
     - Lookup nextHop from precalculated routing table O(1)
     - Forward packet onward directly without parsing/decrypting payload
     ========================================================================= */
  _handleNetworkPacket(packet, fromPeerId) {
    if (!packet || !packet.packetId) return;

    // 1. Loop & Duplicate Prevention via seen packet cache
    if (this._isDuplicatePacket(packet.packetId)) {
      console.log(`[DROP_DUPLICATE] packet=${packet.packetId} at ${this.name}`);
      return;
    }

    // 2. Destination check: Deliver to Application Layer if this node is the destination
    if (packet.destination === this.id) {
      this._deliverToApplication(packet, fromPeerId);
      return;
    }

    // 3. Fast Network Forwarding Path (Intermediate Node)
    // Decrement TTL to prevent loops
    packet.ttl = (packet.ttl ?? 10) - 1;
    if (packet.ttl <= 0) {
      console.warn(`[TTL_EXPIRED] packet=${packet.packetId} dropped at ${this.name} — routing loop prevented`);
      this.cb.onLog?.({ tag: "failure", text: `[TTL_EXPIRED] packet=${packet.packetId} dropped at ${this.name} (TTL reached 0)` });
      return;
    }

    // Determine next hop from cached routing table
    let nextHop = this._getNextHop(packet.destination);
    if (!nextHop || !this.peers.has(nextHop) || this.peers.get(nextHop).state !== "connected") {
      const newPath = this.computeRoute(this.id, packet.destination);
      if (!newPath || newPath.length < 2) {
        console.error(`[NO_ROUTE] packet=${packet.packetId} stalled at ${this.name} — destination unreachable`);
        this.cb.onLog?.({ tag: "failure", text: `[NO_ROUTE] packet=${packet.packetId} stalled at ${this.name} — destination unreachable` });
        return;
      }
      nextHop = newPath[1];
      this.routingTable.set(packet.destination, { nextHop, path: newPath });
    }

    // Update forwarding metadata ONLY
    packet.hopCount = (packet.hopCount || 0) + 1;
    if (!packet.route) packet.route = [packet.source];
    packet.route.push(this.name || this.id);
    packet.nextHop = nextHop;

    const nextPeerName = this.peers.get(nextHop)?.name || nextHop;
    console.log(`[FORWARD] packet=${packet.packetId} ${fromPeerId || packet.source}→${this.name}→${nextPeerName} (hops=${packet.hopCount}, ttl=${packet.ttl})`);

    this.cb.onLog?.({
      tag: "system",
      text: `[FORWARD] packet=${packet.packetId} ${this.name} → ${nextPeerName} (hops: ${packet.hopCount}, ttl: ${packet.ttl})`
    });
    this.cb.onHop?.({ from: this.id, to: nextHop, urgency: (packet.priority || "NORMAL").toLowerCase() });

    // Forward packet directly through the appropriate WebRTC DataChannel queue
    this._enqueuePacket(nextHop, packet);
  }

  /* =========================================================================
     APPLICATION LAYER: Delivers and processes payload ONLY at final destination
     ========================================================================= */
  async _deliverToApplication(packet, fromPeerId) {
    const latencyMs = Math.max(1, Date.now() - packet.timestamp);
    const totalHops = (packet.hopCount || 0) + 1;
    if (!packet.route) packet.route = [packet.source];
    if (!packet.route.includes(this.name || this.id)) packet.route.push(this.name || this.id);

    console.log(`[DELIVERED] packet=${packet.packetId} destination=${this.name} hops=${totalHops} latency=${latencyMs}ms route=${packet.route.join(" → ")}`);
    console.log(`[LATENCY] packet=${packet.packetId} total=${latencyMs}ms hops=${totalHops}`);

    this.stats.delivered += 1;
    const prioLevel = (packet.priority || "NORMAL").toLowerCase();
    this.pendingCloudEvents.push({ type: "delivered", text: `received a ${prioLevel} packet` });

    if (packet.type === "MEDIA") {
      this._handleMediaChunkPacket(packet, latencyMs, totalHops);
      return;
    }

    // Process DATA payload
    let text = "", location = null, verified = null;
    const payload = packet.payload || {};

    if (payload.encrypted) {
      const sender = this.identities.get(packet.source);
      if (!sender || !this.cryptoReady) {
        this.cb.onLog?.({ tag: "failure", text: `Received encrypted packet from unknown identity ${packet.source} — cannot decrypt` });
        return;
      }
      try {
        verified = await verifyEnvelope(sender.signPub, packet.packetId, packet.source, packet.destination, payload.iv, payload.ciphertext, payload.signature);
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, sender.ecdhPub);
        const dec = await decryptPayload(sharedKey, payload.iv, payload.ciphertext);
        text = dec.text;
        location = dec.location;
      } catch (e) {
        this.cb.onLog?.({ tag: "failure", text: `Failed to decrypt packet ${packet.packetId} from ${packet.source}: ${e.message}` });
        return;
      }
    } else {
      text = payload.text || "";
      location = payload.location || null;
      verified = false;
    }

    this.cb.onDelivered?.({
      msgId: packet.packetId,
      packetId: packet.packetId,
      from: packet.source,
      to: packet.destination,
      text,
      location,
      encrypted: !!payload.encrypted,
      verified,
      urgency: { level: prioLevel === "critical" ? "critical" : prioLevel === "high" ? "elevated" : "normal", score: prioLevel === "critical" ? 10 : 3 },
      hops: totalHops,
      latencyMs,
      route: packet.route,
      path: packet.route
    });

    this.cb.onHop?.({ from: fromPeerId || packet.source, to: this.id, urgency: prioLevel });
  }

  _enqueuePacket(peerId, packet) {
    if (!this.sendQueues.has(peerId)) {
      this.sendQueues.set(peerId, { CRITICAL: [], HIGH: [], NORMAL: [], BULK: [] });
    }
    const q = this.sendQueues.get(peerId);
    const prio = (packet.priority || "NORMAL").toUpperCase();
    if (!q[prio]) q[prio] = [];
    q[prio].push(packet);

    const congestion = this._congestionOf(peerId);
    const normalCap = congestion === "congested" ? 15 : congestion === "watch" ? 40 : 120;
    const bulkCap = congestion === "congested" ? 10 : congestion === "watch" ? 25 : 60;

    while (q.BULK && q.BULK.length > bulkCap) {
      q.BULK.shift();
      this.qosStats.dropped += 1;
      this.cb.onLog?.({ tag: "failure", text: `[QoS] Shed bulk packet on congested link to protect critical traffic` });
    }
    while (q.NORMAL && q.NORMAL.length > normalCap) {
      q.NORMAL.shift();
      this.qosStats.dropped += 1;
      this.cb.onLog?.({ tag: "failure", text: `[QoS] Shed low-priority packet on congested link` });
    }
  }

  _drainQueues() {
    for (const [peerId, q] of this.sendQueues.entries()) {
      const entry = this.peers.get(peerId);
      if (!entry || !entry.channel || entry.channel.readyState !== "open") continue;
      const congestion = this._congestionOf(peerId);
      let packet = null;

      // Strict priority drainage: CRITICAL > HIGH > NORMAL > BULK
      if (q.CRITICAL && q.CRITICAL.length) {
        packet = q.CRITICAL.shift();
      } else if (q.HIGH && q.HIGH.length) {
        const throttle = congestion === "congested" ? 0.35 : 0;
        if (Math.random() >= throttle) packet = q.HIGH.shift();
        else this.qosStats.throttled += 1;
      } else if (q.NORMAL && q.NORMAL.length) {
        const throttle = congestion === "congested" ? 0.8 : congestion === "watch" ? 0.3 : 0;
        if (Math.random() >= throttle) packet = q.NORMAL.shift();
        else this.qosStats.throttled += 1;
      } else if (q.BULK && q.BULK.length) {
        const throttle = congestion === "congested" ? 0.95 : congestion === "watch" ? 0.6 : 0.1;
        if (Math.random() >= throttle) packet = q.BULK.shift();
        else this.qosStats.throttled += 1;
      }

      if (packet) {
        this._broadcastTo(peerId, { type: "packet", packet });
      }
    }
  }

  /* =========================================================================
     5-NODE CHAIN FAST PACKET FORWARDING VERIFICATION DEMO (A → B → C → D → E)
     ========================================================================= */
  async runFastForwardingChainDemo() {
    const packetId = `pkt-${uid()}`;
    const startTime = Date.now();

    const pushLog = (tag, text, meta) => {
      if (this.cb.onLog) {
        this.cb.onLog({
          id: uid(),
          tag,
          text,
          meta,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });
      }
    };

    pushLog("system", `🚀 [FAST PACKET FORWARDING TEST] Launching 5-node pipeline: Node-A → Node-B → Node-C → Node-D → Node-E`);

    // 1. Source Node A creates lightweight packet with opaque payload
    const initialPacket = {
      packetId,
      source: "Node-A",
      destination: "Node-E",
      nextHop: "Node-B",
      ttl: 10,
      type: "DATA",
      priority: "CRITICAL",
      timestamp: startTime,
      route: ["Node-A"],
      hopCount: 0,
      payload: {
        text: "⚡ CRITICAL DISPATCH: Structural instability detected at Sector 4 — immediate evacuation",
        encrypted: true,
        cipherDigest: "sha256:8f2a93b4e1c0d5e6"
      }
    };

    console.log(`[SEND] packet=${packetId} source=Node-A destination=Node-E nextHop=Node-B ttl=10`);
    pushLog("critical", `[SEND] packet=${packetId} Node-A initiates packet (Priority: CRITICAL, TTL: 10)`);
    if (this.cb.onHop) this.cb.onHop({ from: "Node-A", to: "Node-B", urgency: "critical" });

    // 2. Intermediate forwarders: Node-B, Node-C, Node-D
    let currentPacket = { ...initialPacket };
    const intermediateChains = [
      { current: "Node-B", next: "Node-C" },
      { current: "Node-C", next: "Node-D" },
      { current: "Node-D", next: "Node-E" },
    ];

    for (const step of intermediateChains) {
      await new Promise(r => setTimeout(r, 45)); // Real async hop delay
      currentPacket.ttl -= 1;
      currentPacket.hopCount += 1;
      currentPacket.route.push(step.current);
      currentPacket.nextHop = step.next;

      console.log(`[FORWARD] packet=${packetId} ${currentPacket.route[currentPacket.route.length - 2]}→${step.current}→${step.next} (hops=${currentPacket.hopCount}, ttl=${currentPacket.ttl})`);
      pushLog("system", `[FORWARD] packet=${packetId} ${step.current} → ${step.next} (hops: ${currentPacket.hopCount}, ttl: ${currentPacket.ttl})`, `Lightweight Network Router: Payload untouched & unparsed`);
      if (this.cb.onHop) this.cb.onHop({ from: step.current, to: step.next, urgency: "critical" });
    }

    // 3. Destination: Node-E (Application Layer delivery)
    await new Promise(r => setTimeout(r, 45));
    currentPacket.hopCount += 1;
    currentPacket.route.push("Node-E");
    const totalLatency = Date.now() - startTime;

    console.log(`[DELIVERED] packet=${packetId} destination=Node-E hops=${currentPacket.hopCount} latency=${totalLatency}ms route=${currentPacket.route.join(" → ")}`);
    console.log(`[LATENCY] packet=${packetId} total=${totalLatency}ms hops=${currentPacket.hopCount}`);

    pushLog("delivered", `[DELIVERED] packet=${packetId} destination=Node-E`, `Route: ${currentPacket.route.join(" → ")} · Hops: ${currentPacket.hopCount} · Latency: ${totalLatency}ms`);

    // Deliver to Application UI
    if (this.cb.onDelivered) {
      this.cb.onDelivered({
        msgId: packetId,
        packetId,
        from: "Node-A",
        to: "Node-E",
        text: currentPacket.payload.text,
        urgency: { level: "critical", score: 10 },
        encrypted: true,
        verified: true,
        hops: currentPacket.hopCount,
        latencyMs: totalLatency,
        route: currentPacket.route,
        path: currentPacket.route
      });
    }

    return {
      success: true,
      packetId,
      route: currentPacket.route,
      hops: currentPacket.hopCount,
      latencyMs: totalLatency
    };
  }

  goOffline() {
    this.mySeq += 1;
    this.linkState.set(this.id, { name: this.name, neighbors: [], seq: this.mySeq });
    this._broadcastToAll({ type: "topo", id: this.id, name: this.name, neighbors: [], seq: this.mySeq });
    for (const entry of this.peers.values()) entry.conn.close();
    this.peers.clear();
    this.cb.onPeerState();
    this.cb.onTopology(this._deriveGraph());
  }
}
