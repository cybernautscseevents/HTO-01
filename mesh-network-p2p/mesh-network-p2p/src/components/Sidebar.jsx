import React from 'react';

export function Sidebar({
  graph,
  selfId,
  peerStates,
  linkMode,
  setLinkMode,
  cloudEnabled,
  toggleCloud,
  cloudUrl,
  setCloudUrl,
  cryptoStatus,
  identityCount,
  locationEnabled,
  toggleLocation,
  online,
  goOffline,
  goOnline,
  onLeaveMesh,
  onChangeName,
  onManualConnect,
  centralServer,
  batteryLevel,
  onTestBatteryDrain,
  onClaimCentralServer,
  onClose,
}) {
  const connectedCount = peerStates.filter(p => p.state === "connected").length;
  const selfNode = graph.nodes.find(n => n.id === selfId);
  const isSelfServer = centralServer && (centralServer.id === selfId || centralServer.name === selfNode?.name);

  return (
    <div className="sidebar" style={{ padding: "14px", gap: "12px", display: "flex", flexDirection: "column" }}>
      
      {/* CARD 1: Device Header */}
      <div className="sidebar-card brand-card" style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--signal)", letterSpacing: "0.08em", fontWeight: 700, textTransform: "uppercase" }}>
              DEVICE NAME
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>
              {selfNode ? selfNode.name : "Device Node"}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="sidebar-collapse-btn"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* CARD: Central Server Authority & Battery Failover */}
      <div className="sidebar-card" style={{ borderColor: isSelfServer ? "rgba(0, 229, 255, 0.35)" : "rgba(255, 171, 64, 0.3)" }}>
        <div className="card-header-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="card-title-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>👑</span> Central Server Authority
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 4,
            background: isSelfServer ? "rgba(0, 229, 255, 0.15)" : "rgba(255, 171, 64, 0.15)",
            color: isSelfServer ? "var(--signal)" : "#FFAB40",
            border: `1px solid ${isSelfServer ? "rgba(0, 229, 255, 0.3)" : "rgba(255, 171, 64, 0.3)"}`
          }}>
            {isSelfServer ? "ACTIVE HUB" : "CLIENT RELAY"}
          </span>
        </div>

        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(0, 0, 0, 0.35)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Current Server:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
              {isSelfServer ? `${selfNode?.name || "This Phone"} (You)` : (centralServer?.name || "Network Coordinator")}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Battery Status:</span>
            <span style={{
              fontSize: 12,
              fontWeight: 800,
              color: (isSelfServer ? batteryLevel : (centralServer?.battery || 85)) <= 20 ? "#FF3D5A" : "var(--signal)"
            }}>
              🔋 {isSelfServer ? batteryLevel : (centralServer?.battery || 85)}%
              {(isSelfServer ? batteryLevel : (centralServer?.battery || 85)) <= 20 ? " ⚠ LOW" : " ✓ OK"}
            </span>
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 6, lineHeight: 1.4 }}>
          {isSelfServer
            ? "🛡️ If battery drops ≤ 15% or phone dies, server role automatically transfers to another phone peer."
            : "⚡ Connected to mesh central server. Auto-failover engages if host phone battery dies."}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {isSelfServer ? (
            <button
              onClick={onTestBatteryDrain}
              style={{
                flex: 1,
                padding: "7px 8px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                background: "rgba(255, 61, 90, 0.15)",
                border: "1px solid rgba(255, 61, 90, 0.4)",
                color: "#FF3D5A",
                cursor: "pointer"
              }}
              title="Drain simulated battery to 8% to test automatic redirect/failover to another phone"
            >
              🔋 Drain Battery (Test Failover)
            </button>
          ) : (
            <button
              onClick={onClaimCentralServer}
              style={{
                flex: 1,
                padding: "7px 8px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                background: "rgba(0, 229, 255, 0.15)",
                border: "1px solid rgba(0, 229, 255, 0.4)",
                color: "var(--signal)",
                cursor: "pointer"
              }}
              title="Promote this phone to become the active Central Server"
            >
              👑 Claim Central Server Role
            </button>
          )}
        </div>
      </div>

      {/* CARD 2: Known Mesh Nodes Manager */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="card-title-sm">🌐 Connected Devices ({graph.nodes.length})</span>
          {onManualConnect && (
            <button
              onClick={onManualConnect}
              style={{
                background: "rgba(75, 158, 255, 0.15)",
                border: "1px solid rgba(75, 158, 255, 0.35)",
                color: "var(--accent-blue)",
                borderRadius: "6px",
                padding: "2px 7px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer"
              }}
              title="Connect directly to a peer by name or ID"
            >
              ➕ Connect
            </button>
          )}
        </div>

        <div className="node-list">
          {graph.nodes.map(n => {
            const peer = peerStates.find(p => p.id === n.id);
            const link = graph.links.find(l => (l.a === selfId && l.b === n.id) || (l.b === selfId && l.a === n.id));
            const congestion = link ? link.congestion : null;
            const cColor = congestion === "congested" ? "var(--critical)" : congestion === "watch" ? "var(--elevated)" : null;
            return (
              <div className="node-row" key={n.id} style={{ fontSize: 13, padding: "8px 10px" }}>
                <span className={`dot ${n.id === selfId || (peer && peer.state === "connected") || n.alive ? "alive" : "dead"}`}></span>
                <span className="name" style={{ fontWeight: 600 }}>{n.name}{n.id === selfId ? <span className="you" style={{ fontSize: 10, marginLeft: 4 }}>you</span> : null}</span>
                {cColor && <span className="rtt" style={{ color: cColor, borderColor: cColor, fontSize: 10.5 }}>{congestion}</span>}
                {peer && <span className="rtt" style={{ fontSize: 10.5 }}>{peer.state}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "6px", marginTop: 10 }}>
          <button className="tiny-btn" style={{ flex: 1, padding: "9px", fontSize: 12, fontWeight: 700 }}
            id="manage-links-btn"
            onClick={() => setLinkMode(m => !m)}>
            {linkMode ? "✓ Done Links" : "⚡ Manage Links"}
          </button>
          {onManualConnect && (
            <button className="tiny-btn" style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "var(--accent-blue)" }}
              onClick={onManualConnect}>
              ➕ Connect Peer
            </button>
          )}
        </div>
      </div>

      {/* CARD 3: End-to-End Security */}
      <div className="sidebar-card">
        <div className="card-header-sm">
          <span className="card-title-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg className="section-icon-svg crypto-icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            End-to-End Encryption
          </span>
        </div>
        <div className="cloud-status" style={{ fontSize: 12.5 }}>
          {cryptoStatus.ready
            ? <span className="synced">● Active — fingerprint {cryptoStatus.fingerprint}</span>
            : <span className="error">○ Unavailable — {cryptoStatus.secure ? "generating keys…" : "no secure context"}</span>}
          <div style={{ marginTop: 4, opacity: 0.8 }}>
            {identityCount} identit{identityCount === 1 ? "y" : "ies"} known
          </div>
        </div>
      </div>

      {/* CARD 4: Telemetry & Controls */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ marginBottom: 10 }}>
          <span className="card-title-sm">📡 Telemetry & Services</span>
        </div>

        {/* Cloud Sync Row */}
        <div className="control-row-card">
          <div className="cloud-header" style={{ margin: 0 }}>
            <span className="cloud-title" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <svg className={`section-icon-svg cloud-icon-svg ${cloudEnabled ? "active-spin" : ""}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17.5 19A4.5 4.5 0 0 0 19 10.05A7 7 0 0 0 5.2 11.5A4.5 4.5 0 0 0 6.5 19h11z"/>
                <polyline points="12 13 12 9 10 11"/>
              </svg>
              Cloud Sync
            </span>
            <button
              className={`normal-toggle-btn ${cloudEnabled ? "active" : ""}`}
              onClick={toggleCloud}
              id="cloud-toggle-btn"
            >
              {cloudEnabled ? "✓ ON" : "○ OFF"}
            </button>
          </div>
          {cloudEnabled && (
            <input className="cloud-url-input" value={cloudUrl} style={{ fontSize: 12, padding: "6px 8px", marginTop: 8 }}
              onChange={e => setCloudUrl(e.target.value)} id="cloud-url-input" />
          )}
        </div>

        {/* GPS Location Row */}
        <div className="control-row-card" style={{ marginTop: 8 }}>
          <div className="cloud-header" style={{ margin: 0 }}>
            <span className="cloud-title" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <svg className="section-icon-svg location-icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="9"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Location Sharing
            </span>
            <button
              className={`normal-toggle-btn ${locationEnabled ? "active" : ""}`}
              onClick={toggleLocation}
              id="location-toggle-btn"
            >
              {locationEnabled ? "✓ ON" : "○ OFF"}
            </button>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
        {onLeaveMesh && (
          <button className="btn-offline" onClick={onLeaveMesh} style={{ fontSize: 12.5, padding: "8px", fontWeight: 700, background: "rgba(240,166,60,0.12)", color: "#f5b963", borderColor: "rgba(240,166,60,0.3)" }}>
            🚪 Leave ZoneSync Network
          </button>
        )}
        {online
          ? <button className="btn-offline" id="go-offline-btn" onClick={goOffline} style={{ fontSize: 12.5, padding: "8px", fontWeight: 700 }}>⚠ Simulate Node Failure</button>
          : <button className="btn-online" id="go-online-btn" onClick={goOnline} style={{ fontSize: 12.5, padding: "8px", fontWeight: 700 }}>↻ Reconnect Node</button>}
      </div>

    </div>
  );
}
