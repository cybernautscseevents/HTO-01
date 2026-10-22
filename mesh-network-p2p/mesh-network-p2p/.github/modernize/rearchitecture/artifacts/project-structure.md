# Project Structure

## Classification

Full-stack JavaScript application: a React/Vite single-page frontend plus Node.js/Express/Socket.IO backend processes. It is not a monorepo; one package manifest contains the frontend and backend runtime dependencies.

## Runtime entrypoints

- `src/main.jsx` bootstraps React into `#root`.
- `src/App.jsx` defines the BrowserRouter and five page routes.
- `signaling-server.js` is the primary combined production server and serves `dist`/`public`.
- `cloud-server.js`, `echolocate-server.js`, and `api-server.js` are independently runnable service processes.

## Frontend layers

- `src/pages/`: route-level orchestration and join/session lifecycle.
- `src/components/`: UI panels, controls, canvas visualizations, and media composer.
- `src/services/`: browser-domain engines for mesh routing, crypto, EchoLocate, PulseSeeker, urgency, and Lifeboat scoring.
- `src/utils/`: reusable browser media/audio helpers.
- `src/index.css`: global tactical dark-theme design system and layout styles.

## Backend layers

- HTTP/Socket.IO adapters in `*-server.js`.
- Domain logic in `lethality-calculator.js` and `priority-queue.js`.
- In-memory state stores for peers, telemetry, events, model terms, beacons, and queues.

## Functional domains

1. P2P mesh bootstrap, WebRTC signaling, gossip topology, Dijkstra routing, QoS, failover.
2. Encrypted text, image, voice, and location messaging.
3. EchoLocate acoustic positioning.
4. PulseSeeker passive tapping/stillness detection and beacon dispatch.
5. Lifeboat lethality scoring, priority queues, and rescuer dispatch.
6. Cloud telemetry aggregation and urgency-model distribution.

## Source inventory

The non-generated source contains 5 route pages, 9 reusable UI components, 6 browser service/utility modules, 4 server entrypoints, 2 backend domain modules, and 1 Node test script. `node_modules`, `dist`, and `public/assets` are generated/vendor outputs and are excluded from architecture anchors.
