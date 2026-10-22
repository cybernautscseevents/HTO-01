# Architecture Index

This index is not the full contract. Do not implement from this file alone; follow the artifact paths below.

## Implementation Guide

### Global artifacts

- `unit_graph.yaml`: all entrypoints, dependencies, shared references, and source anchors. Filter by assigned `name`.
- `wire_contracts.yaml`: filter contracts by `unit`; preserve rows marked `frozen`.
- `shared_modules.yaml`: filter modules whose `used_by_units` contains the assigned unit.
- `cross_unit_state.yaml`: filter flows whose writer or reader matches the assigned unit; runtime-confirm rows marked `must_confirm: runtime`.
- `project-structure.md`, `tech-stack.md`, and `data-model.md`: global context only; do not treat them as a replacement for source inspection.

### Unit: mesh-console

- Trigger: `/`
- Read `units/mesh-console/behavior.yaml`, `bindings.yaml`, and `unit_decomposition.yaml`.
- Read mesh-signaling, lifeboat-api, cloud-sync, and shared session rows.
- Completion evidence: implemented preserved routing/media/security branches and build/runtime evidence.

### Unit: echolocate-radar

- Trigger: `/echolocate`
- Read the three `units/echolocate-radar/*` artifacts.
- Read EchoLocate event contract and shared session state.
- Completion evidence: audio permission/error behavior, round lifecycle, and position rendering verified.

### Unit: pulseseeker-detection

- Trigger: `/pulseseeker`
- Read the three `units/pulseseeker-detection/*` artifacts.
- Read beacon and session-state contracts.
- Completion evidence: tapping/stillness detection, beacon dispatch, and coordinate-sharing behavior verified.

### Unit: lifeboat-routing

- Trigger: `/lifeboat`
- Read the three `units/lifeboat-routing/*` artifacts.
- Read Lifeboat REST contract and shared domain module.
- Completion evidence: score thresholds, queue ordering/TTL behavior, API errors, and dispatch verified.

### Unit: cloud-dashboard

- Trigger: `/dashboard` or `/dashboard.html`
- Read the three `units/cloud-dashboard/*` artifacts.
- Read cloud-sync contract.
- Completion evidence: live updates, stale-node display, model deployment response, and error state verified.

### Unit: global-backend

- Trigger: Socket.IO connections and REST API calls.
- Read the global contracts and `shared_modules.yaml`; the server entrypoints are `signaling-server.js`, `cloud-server.js`, `echolocate-server.js`, and `api-server.js`.
- Completion evidence: each service starts on its configured port and all listed event/HTTP contracts remain callable.

