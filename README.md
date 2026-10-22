# 🌐 ZoneSync P2P & Disaster Rescue Suite (v3.0)
> **Serverless-Resilient P2P Mesh Network with On-Device AI, End-to-End Encryption, Acoustic Indoor Positioning (EchoLocate), Passive Victim Detection (PulseSeeker), and Lifeboat Priority Routing.**

> **Project status:** This is the original full project transformed in place with the ZoneSync branding. The existing implementation, demos, and intentionally incomplete areas are preserved; this rename does not claim that every production integration is complete.

The application is located in [`mesh-network-p2p/mesh-network-p2p`](./mesh-network-p2p/mesh-network-p2p). The product names used throughout the source, UI, server logs, metadata, and documentation are:

- **ZoneSync** — the overall product and peer-to-peer rescue mesh.
- **EchoLocate** — acoustic indoor positioning and 2D radar.
- **PulseSeeker** — passive victim detection.
- **Lifeboat** — lethality scoring and rescue-priority routing.

### Intentional broken-backend demo state

The frontend and project structure remain available, but selected backend
integrations intentionally contain glitches for demonstration purposes:

- PulseSeeker beacon broadcasts use an intentionally misspelled Socket.IO event,
  so the REST request can succeed while connected clients miss the live alert.
- Cloud model reads return a stale version after an update.
- EchoLocate uses an intentionally incorrect speed-of-sound constant, producing
  inaccurate distance and position results.

These are deliberate demo defects, not production fixes. Restore the original
event name, model response, and `343.0 m/s` constant before treating the backend
as operational.

---

## 📌 Table of Contents
1. [Overview: What is Happening?](#-1-overview-what-is-happening)
2. [Key Features](#-2-key-features)
3. [Technologies & Architecture Used](#-3-technologies--architecture-used)
4. [How It Works: Deep-Dive Technical Mechanics](#-4-how-it-works-deep-dive-technical-mechanics)
5. [Complete Command Reference](#-5-complete-command-reference)
6. [Step-by-Step Demo Pitch for Judges](#-6-step-by-step-demo-pitch-for-judges)
7. [API & Endpoint Reference](#-7-api--endpoint-reference)
8. [Limitations & Production Roadmap](#-8-limitations--production-roadmap)

---

## 🌍 1. Overview: What is Happening?

In disasters such as earthquakes, building collapses, floods, and severe grid failures, traditional communications collapse in two catastrophic ways:
1. **Infrastructure Blackout**: Cell towers lose power, fiber backbones sever, and internet access disappears.
2. **Victim Silence**: Trapped, pinned, or unconscious victims cannot press SOS buttons, unlock phones, or speak.

### What ZoneSync Does
ZoneSync transforms standard smartphones, tablets, and laptops into a **self-healing, zero-install, decentralized rescue mesh**.
- Devices discover each other locally and form **serverless WebRTC data channels**.
- Messages, voice notes, photos, and GPS coordinates route **hop-by-hop** across devices without requiring internet or cellular service.
- If the signaling server dies after initial handshake, the **P2P mesh continues operating independently**.
- When victims cannot move, **PulseSeeker** passively monitors ambient audio (rhythmic debris tapping) and motion sensors (unconscious stillness) to auto-dispatch emergency survivor beacons.
- When GPS is blocked by concrete rubble, **EchoLocate** calculates indoor 2D positions using ultrasonic acoustic chirps and multilateration.
- The **Lifeboat Engine** scores multi-sensor lethality (0–100) and routes critical cases to the front of rescue queues.

---

## ✨ 2. Key Features

| Feature | Description |
|---|---|
| 📡 **Serverless P2P Mesh Routing** | Multi-hop encrypted routing using local Dijkstra shortest-path algorithms and gossip topology adverts over WebRTC data channels. |
| 🔒 **End-to-End Encryption (E2EE)** | On-device ECDH (P-256) key exchange + AES-256-GCM payload encryption + ECDSA (P-256) digital signatures. Relays carry only opaque ciphertext. |
| 🤖 **On-Device AI Urgency Classifier** | In-browser NLP urgency classification that tags messages as `CRITICAL`, `ELEVATED`, or `NORMAL` without sending data to the cloud. |
| 🎤 **Encrypted Voice Notes** | Mobile & desktop audio micro-recording (Opus/AAC/MP4) with automatic transmission upon completion and inline playback. |
| 🖼️ **Encrypted Image Notes** | Canvas-based image compression (`maxDim = 800px`, JPEG quality 0.6) with automatic chunking, chunk progress tracking, and fallback. |
| 📍 **GPS Location Broadcast** | Broadcasts live device coordinates with Google Maps links across the entire mesh with one click. |
| 🔊 **EchoLocate (Acoustic 2D Radar)** | Plots relative indoor (x, y) coordinates without GPS or WiFi using 17–19 kHz ultrasonic LFM chirps and 2D least-squares multilateration. |
| 🛡️ **PulseSeeker (Passive Victim Detection)** | 100% offline TinyML that listens for rhythmic pipe tapping (2–4 Hz) and detects prolonged unconscious stillness (>5 min), auto-dispatching SOS beacons. |
| ⚖️ **Lifeboat Priority Routing** | Multi-sensor lethality calculator and 4-tier priority queue (`critical`, `elevated`, `normal`, `low`) for first responders. |
| ☁️ **Opportunistic Cloud Sync** | Opt-in telemetry sync and real-time remote AI keyword model distribution when internet is intermittently available. |

---

## 🛠️ 3. Technologies & Architecture Used

### Frontend & UI
- **React 19 & React Router v7**: Component-driven single-page architecture for fast client-side navigation.
- **Vite 8 (`@vitejs/plugin-react` & `@vitejs/plugin-basic-ssl`)**: Blazing-fast development bundle with automatic HTTPS generation for mobile sensor permissions.
- **HTML5 Canvas 2D**: Real-time rendering of live network topology graph and 360° acoustic radar canvas.
- **Vanilla Modern CSS**: Dark mode tactical interface with glassmorphism, pulse animations, and responsive mobile layouts.

### Networking & P2P Protocols
- **WebRTC (`RTCPeerConnection`, `RTCDataChannel`)**: Serverless, low-latency, bidirectional peer-to-peer data channels between browsers.
- **Socket.io Client & Server (v4.8)**: Ephemeral bootstrap signaling for initial WebRTC SDP offer/answer exchange and ICE candidate negotiation.
- **OSPF-Style Gossip Protocol**: Decentralized link-state advertisement protocol where nodes broadcast local peer lists to build global topology maps.
- **Dijkstra Shortest-Path Routing**: Dynamic graph traversal with congestion-weighted edge costs.

### Cryptography & Security
- **Web Crypto API (`window.crypto.subtle`)**: Hardware-accelerated on-device cryptographic operations.
- **ECDH (Elliptic Curve Diffie-Hellman on P-256 Curve)**: Derives symmetric encryption keys between any two peers without sharing secrets over the wire.
- **AES-256-GCM**: Authenticated symmetric encryption for messages, photos, voice notes, and location coordinates.
- **ECDSA (P-256 with SHA-256)**: Cryptographic signature verification to prevent spoofing, packet tampering, or impersonation.

### Audio & Digital Signal Processing (DSP)
- **Web Audio API (`AudioContext`, `MediaRecorder`, `AudioWorklet`/ScriptProcessor)**: High-resolution audio capture, analysis, and synthesis.
- **Linear Frequency Modulated (LFM) Chirp Synthesis**: Generates 17–19 kHz ultrasonic sweep waveforms for acoustic ranging.
- **Matched-Filter Cross-Correlation**: Time-domain cross-correlation against reference chirp templates for sub-millisecond Time-of-Arrival (ToA) detection.
- **MFCC (Mel-Frequency Cepstral Coefficients) & Spectral Centroids**: 25-dimensional audio feature extraction for tapping rhythm analysis.

### Sensor Telemetry & Mobile APIs
- **`DeviceMotion` & `DeviceOrientation` APIs**: Accelerometer and gyroscopic tracking for fall and unconsciousness detection.
- **HTML5 Geolocation API**: High-accuracy GPS positioning with fallback coordinates.
- **HTML5 FileReader & Canvas Compression**: In-browser image downsampling to optimize packet sizes for mesh transmission.

### Backend Services
- **Node.js & Express 5**: Lightweight, modular backend micro-servers for signaling, cloud telemetry sync, acoustic localization, and lifeboat scoring.

---

## ⚙️ 4. How It Works: Deep-Dive Technical Mechanics

```
                   +---------------------------------------+
                   |       ZoneSync Node (Browser)         |
                   |                                       |
                   |  +---------------------------------+  |
                   |  |      UI / Composer / Canvas     |  |
                   |  +----------------+----------------+  |
                   |                   |                   |
                   |  +----------------v----------------+  |
                   |  | On-Device AI Urgency Classifier |  |
                   |  +----------------+----------------+  |
                   |                   |                   |
                   |  +----------------v----------------+  |
                   |  | Web Crypto E2EE (ECDH + ECDSA)  |  |
                   |  +----------------+----------------+  |
                   |                   |                   |
                   |  +----------------v----------------+  |
                   |  | Dijkstra Router & QoS Queues    |  |
                   |  +----------------+----------------+  |
                   |                   |                   |
                   +-------------------+-------------------+
                                       |
                   +-------------------v-------------------+
                   |         WebRTC Data Channels          |
                   |      (Hop-by-Hop P2P Relaying)        |
                   +----+-----------------------------+----+
                        |                             |
                        v                             v
             +--------------------+         +--------------------+
             | Peer B (Relay Node)|         | Peer C (Recipient) |
             | (Opaque Ciphertext)|         | (Decrypted & Acked)|
             +--------------------+         +--------------------+
```

### 1. Serverless P2P Discovery & Routing
1. When a device joins, it connects to `signaling-server.js` (port 4001) for 1–2 seconds to exchange WebRTC SDP offers/answers with 1–2 nearby peers.
2. Once data channels are open, peers exchange **Link-State Gossip Packets**.
3. Each node independently builds an adjacency matrix of the network and computes shortest paths via **Dijkstra's Algorithm**.
4. If a relay node disconnects or the signaling server is killed, surviving nodes recalculate alternate routes instantly without dropping connectivity.

### 2. End-to-End Encryption Pipeline
1. On startup, each node generates an ephemeral ECDH keypair and ECDSA signing keypair using `crypto.subtle`.
2. Public keys are broadcasted across the gossip protocol.
3. When Node A messages Node B:
   - Node A derives a shared AES-256-GCM key: `deriveSharedKey(Priv_A, Pub_B)`.
   - Node A encrypts the payload (text, media, location) with an initialization vector (IV).
   - Node A signs the ciphertext envelope using `Sign_A`.
4. Intermediate relay nodes inspect only the routing envelope (`to`, `from`, `hopIndex`) and forward ciphertext without reading it.
5. Node B verifies the signature with `SignPub_A` and decrypts with `deriveSharedKey(Priv_B, Pub_A)`.

### 3. Media Chunking & Voice Transmission
1. When capturing voice notes, `MediaRecorder` buffers audio into Opus/AAC/MP4 data chunks.
2. On stop, the audio blob is converted to a base64 DataURL and split into 12,000-character transmission chunks.
3. Chunks stream across WebRTC data channels with sequence numbers (`chunkIndex / totalChunks`).
4. The destination reassembles and verifies the chunks, rendering an inline audio player with one-tap playback.

### 4. EchoLocate Acoustic Positioning
1. Because browser clocks are unsynchronized, EchoLocate implements **Time-Division Acoustic Round-Trip Time (RTT)**.
2. Pinger Device emits an ultrasonic 17–19 kHz Linear Frequency Modulated (LFM) chirp.
3. Listener devices detect the chirp using **Matched-Filter Cross-Correlation** and reply at scheduled time offsets.
4. The Pinger calculates pairwise distances: $d = \frac{\Delta T_{\text{RTT}} - \text{offset}}{2} \times 343\text{ m/s}$.
5. A 2D least-squares multilateration algorithm converts distances into relative $(x, y)$ coordinates and plots them on the radar canvas.

### 5. PulseSeeker Passive Survivor Detection
1. Runs background feature extraction: 13 MFCC sub-bands, Zero-Crossing Rate (ZCR), Spectral Centroids, and accelerometer variance.
2. A 2-layer in-browser neural matrix evaluates signals against:
   - **Rhythmic Pipe/Wall Tapping**: 2–4 Hz peak periodicity with high high-frequency harmonics.
   - **Inertial Unconsciousness**: Accelerometer variance $< 0.02\text{ m/s}^2$ for $> 5\text{ minutes}$.
3. When detection confidence exceeds 80%, PulseSeeker automatically constructs an SOS beacon and broadcasts it across the mesh.

### 6. Lifeboat Lethality Scoring & Rescuer Queue
1. Ingests multi-sensor telemetry at `POST /api/heartbeat`.
2. Computes lethality score (0–100):
   - Sudden Barometer Drop ($>5\text{ hPa/min}$): **+50 pts**
   - Ambient Darkness ($<5\text{ lux}$): **+30 pts**
   - Injury Keywords (*bleeding, trapped, crushed*): **+25 pts**
   - Flood Keywords (*water rising, drowning*): **+20 pts**
   - Vulnerable Person (*infant, pregnant, elderly*): **+15 pts**
   - Water Proximity / Low Battery: **+10–15 pts**
3. Enqueues critical survivors ($\ge 80\text{ pts}$) at the top of the priority queue for instant rescuer deployment.

---

## 💻 5. Complete Command Reference

From the repository root, navigate to the ZoneSync project directory:

```bash
cd mesh-network-p2p/mesh-network-p2p
npm install
```

### Start Services

```bash
# 1. Start Primary Signaling Server (Port 4001)
npm run start:signaling

# 2. Start Cloud Sync & Remote Ops Server (Port 4002)
npm run start:cloud

# 3. Start Standalone EchoLocate Server (Port 4003)
npm run start:echolocate

# 4. Start Lifeboat Priority Queue Server (Port 4004)
npm run start:lifeboat

# 5. Run Automated Lifeboat & Queue Stress Test Suite
npm run test:lifeboat

# 6. Launch Frontend Dev Server (Port 3000 / HTTPS Network Access)
npm run dev -- --host

# 7. Production Build
npm run build
```

---

## 🎬 6. Step-by-Step Demo Pitch for Judges

1. **Serverless Resilience**:
   - Open 3 browser windows on `https://localhost:3000/`. Join as *Alpha*, *Beta*, and *Gamma*.
   - Show direct WebRTC links in the visual topology canvas.
   - **Kill the signaling server in terminal (`Ctrl+C`)**. Send messages between tabs to demonstrate **100% serverless peer-to-peer routing**.

2. **On-Device AI Urgency & Media Notes**:
   - Type `"trapped under heavy debris, bleeding heavily"`. Show real-time **🔴 CRITICAL** AI tag.
   - Click **`🎤 Voice Note`**, record audio, and click **`⏹ Stop & Send`**. Show instant delivery and playback on the other peer.
   - Click **`🖼️ Image Note`**, pick a photo, and watch chunk progress stream and render.

3. **EchoLocate Indoor Positioning**:
   - Open `/echolocate`, click **`⚡ Simulate Demo Plot`**, and view the 2D acoustic radar map with relative distance vectors.

4. **PulseSeeker Passive Victim Detection**:
   - Open `/pulseseeker`, click **`🛡️ Activate Passive Detection Sensors`**, then click **`🔨 Simulate Tapping (3.2 Hz)`**.
   - Watch tapping confidence hit **94%** and auto-broadcast a survivor beacon across the mesh!

5. **Lifeboat Priority Routing**:
   - Run `npm run test:lifeboat` or view `/lifeboat` to showcase the 100/100 multi-sensor lethality score and prioritized rescue dispatch queue.

---

## 📊 7. API & Endpoint Reference

| Endpoint | Method | Port | Description |
|---|---|---|---|
| `/socket.io` | WS / HTTP | 4001 | WebRTC signaling & EchoLocate socket handlers |
| `/sync` | POST | 4002 | Opportunistic cloud telemetry sync |
| `/model` | GET / POST | 4002 | AI classifier model distribution & updates |
| `/echolocate-api/status` | GET | 4003 | EchoLocate server status & active round metrics |
| `/api/auto-beacon` | POST | 4001 / 4004 | Ingests PulseSeeker passive survivor beacons |
| `/api/heartbeat` | POST | 4004 | Lifeboat multi-sensor lethality scoring & enqueuing |
| `/api/priority/queue` | GET | 4004 | Returns queue metrics & next critical messages |
| `/api/priority/critical` | GET | 4004 | Returns all active critical messages with coordinates |
| `/api/alert/send` | POST | 4004 | Triggers emergency alert dispatch for critical queue |
| `/api/priority/stats` | GET | 4004 | Returns detailed queue stats & throughput trends |

---

## 💡 8. Limitations & Production Roadmap

- **Acoustic Attenuation**: High-frequency acoustic chirps (17–19 kHz) attenuate through thick concrete walls. EchoLocate exposes configurable frequency ranges (e.g. 15–18 kHz) for real-device hardware tuning.
- **Mobile HTTPS Sandbox**: Mobile browsers require HTTPS for microphone and motion sensors. ZoneSync includes built-in SSL support (`@vitejs/plugin-basic-ssl`) for seamless local Wi-Fi testing.
- **Time-Division Interval**: Acoustic positioning uses discrete 15-second time-division rounds to avoid clock sync issues without requiring GPS time servers.
- **PKI Fingerprint Roadmap**: Session keypairs are generated per browser session. Production deployments can pre-provision device fingerprints via QR-code pairing prior to field operations.
