# Data Model

The application has no persisted database schema. Runtime state is held in browser memory, browser storage, and Node process memory.

## Browser state

- `mesh_node_name` and `mesh_joined` are stored in local/session storage.
- Mesh topology contains nodes, links, neighbor RTTs, sequence numbers, routing paths, congestion state, and packet deduplication entries.
- Identity state contains ECDH/signing public keys and fingerprints; payloads contain IV/ciphertext/signature envelopes.
- Sensor state contains audio features, motion history, stillness duration, GPS coordinates, battery, and acoustic measurements.

## Server state

- Signaling server: connected socket registry, survivor beacons, Lifeboat queues, alert log, telemetry node snapshots, event log, and AI term model.
- Cloud server: telemetry snapshots, event log, and AI term model.
- EchoLocate server: registered nodes, current measurement round, pairwise distances, and calculated positions.
- Lifeboat queue entries: message/device metadata, score, priority, timestamp, TTL, factors, and dispatch counters.

## Key entities

1. Mesh node — browser identity and routing participant.
2. Message envelope — encrypted or cleartext payload routed hop-by-hop.
3. Survivor beacon — PulseSeeker detection with confidence, coordinates, and evidence.
4. Lethality assessment — score, factors, priority, interpretation, and recommendations.
5. Queue entry — scored emergency waiting for dispatch.
6. Telemetry snapshot — node topology/statistics and recent events sent to cloud.
7. AI urgency model — versioned term-to-weight map.
8. EchoLocate round — timed pinger/listener measurement cycle producing relative positions.
