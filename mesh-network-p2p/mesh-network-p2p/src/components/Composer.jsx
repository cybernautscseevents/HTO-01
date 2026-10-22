import React, { useState, useEffect } from 'react';

export function Composer({
  target,
  setTarget,
  text,
  setText,
  otherKnownNodes = [],
  nodes = [],
  selfId,
  peerStates = [],
  urgencyPreview,
  pickImage,
  toggleRecording,
  cancelRecording,
  recording,
  recordSecs = 0,
  mediaProgress,
  send,
  joined,
  online,
  broadcastText,
  setBroadcastText,
  shareLocationToAll,
  broadcasting,
  log = [],
  fileInputRef,
  handleImageFile,
  onToggleSidebar,
  onAddDemoPeers,
}) {
  const [showLog, setShowLog] = useState(false);
  const [showDevices, setShowDevices] = useState(false);

  function handleQuickPanic() {
    setText("CRITICAL EMERGENCY: Trapped under rubble, bleeding heavily, need immediate rescue");
    if (otherKnownNodes.length > 0 && !target) {
      setTarget(otherKnownNodes[0].id);
    }
  }

  const allNodes = nodes.length > 0 ? nodes : otherKnownNodes;

  return (
    <div className="side-right">
      {/* 1. Connected Devices & Names Section with Toggle Option */}
      <div className="connected-devices-section">
        <div
          className="connected-devices-header"
          onClick={() => setShowDevices(v => !v)}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-dot pulse" style={{ width: 8, height: 8 }}></span>
            <span className="connected-devices-title">
              Connected Devices ({allNodes.length})
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {onToggleSidebar && (
              <button
                type="button"
                className="btn-open-sidebar-mini"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSidebar();
                }}
                title="Open Node Settings & Services"
              >
                ⚙ Manage
              </button>
            )}
            <button
              type="button"
              className="btn-log-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setShowDevices(v => !v);
              }}
            >
              {showDevices ? "▲ Hide Devices" : "▼ Show Devices"}
            </button>
          </div>
        </div>

        {showDevices && (
          <div className="connected-devices-list">
          {allNodes.length === 0 ? (
            <div className="devices-empty-state">
              <span className="live-dot pulse" style={{ opacity: 0.6 }}></span>
              <span>Scanning for nearby mesh devices on this network...</span>
            </div>
          ) : (
            allNodes.map(n => {
              const isSelf = n.id === selfId;
              const peer = peerStates.find(p => p.id === n.id);
              const isDirect = Boolean(peer && peer.state === "connected");
              const isSelected = target === n.id;

              return (
                <div
                  key={n.id}
                  className={`connected-device-item ${isSelf ? 'self-item' : ''} ${isSelected ? 'selected-target' : ''}`}
                  onClick={() => {
                    if (!isSelf) setTarget(n.id);
                  }}
                  role={isSelf ? undefined : "button"}
                  tabIndex={isSelf ? undefined : 0}
                >
                  <div className="device-item-left">
                    <div className="device-avatar-badge">
                      {isSelf ? "👤" : "📱"}
                    </div>
                    <div className="device-item-meta">
                      <div className="device-item-name">
                        <strong>{n.name}</strong>
                        {isSelf && <span className="device-self-tag">You</span>}
                      </div>
                      <div className="device-item-status">
                        {isSelf ? (
                          <span style={{ color: "var(--signal)" }}>Active Host Node</span>
                        ) : isDirect ? (
                          <span style={{ color: "var(--signal)" }}>● Direct P2P Link</span>
                        ) : (
                          <span style={{ color: "var(--accent-blue)" }}>● Mesh Relay</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isSelf && (
                    <button
                      type="button"
                      className={`btn-device-select ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTarget(n.id);
                      }}
                    >
                      {isSelected ? "✓ Destination" : "✉ Message"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}
      </div>

      {/* 2. Send E2E Encrypted Message Composer */}
      <div className="composer">
        <div className="composer-header">
          <div className="section-label" style={{ padding: 0 }}>📡 Send Encrypted Message</div>
          <button className="panic-preset-btn" onClick={handleQuickPanic}>
            🚨 PANIC SOS
          </button>
        </div>

        {/* Quick Destination Peer Selector Chips */}
        {otherKnownNodes.length > 0 ? (
          <div className="peer-chips-row">
            <span className="peer-chips-label">TO:</span>
            {otherKnownNodes.map(n => {
              const isSelected = target === n.id;
              return (
                <button
                  type="button"
                  key={n.id}
                  className={`peer-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => setTarget(n.id)}
                >
                  <span className="chip-dot"></span>
                  <span>{n.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="demo-peers-helper-box">
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              No other device on mesh yet.
            </div>
            {onAddDemoPeers && (
              <button
                type="button"
                className="demo-peers-btn-inline"
                onClick={onAddDemoPeers}
              >
                ⚡ Add Demo Peers (Rescue-Alpha / Medic)
              </button>
            )}
          </div>
        )}

        <select
          id="target-select"
          value={target}
          onChange={e => setTarget(e.target.value)}
          style={{ fontSize: 13.5, padding: "9px 12px", marginTop: 4 }}
        >
          {otherKnownNodes.length === 0 ? (
            <option value="">No peers connected yet…</option>
          ) : (
            !target && <option value="">Select destination peer…</option>
          )}
          {otherKnownNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>

        <textarea
          id="message-input"
          rows="3"
          placeholder='Try typing: "need medical help, trapped under rubble"'
          value={text}
          onChange={e => setText(e.target.value)}
          style={{ fontSize: 14, padding: "10px 12px" }}
        />

        <div className="urgency-preview">
          {urgencyPreview && (
            <span className={`urgency-badge ${urgencyPreview}`} style={{ fontSize: 13, padding: "6px 12px" }}>
              {urgencyPreview === "critical" ? "🔴" : urgencyPreview === "elevated" ? "🟡" : "🟢"}
              {" "}On-Device AI Classification: {urgencyPreview.toUpperCase()}
            </span>
          )}
        </div>

        {/* Live Recording In-Progress Banner with Stop & Send / Cancel */}
        {recording && (
          <div
            style={{
              background: "rgba(255, 75, 92, 0.15)",
              border: "1px solid rgba(255, 75, 92, 0.4)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="live-dot pulse" style={{ background: "#ff4b5c", boxShadow: "0 0 10px #ff4b5c" }}></span>
                <span style={{ fontSize: 13, color: "#ff4b5c", fontWeight: 700 }}>
                  Recording Voice Note ({recordSecs}s)...
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>Live Audio</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="tiny-btn"
                style={{
                  flex: 1.5,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #ff4b5c 0%, #c0392b 100%)",
                  borderColor: "rgba(255, 75, 92, 0.6)",
                  color: "#fff",
                  boxShadow: "0 2px 10px rgba(255,75,92,0.3)",
                }}
                onClick={toggleRecording}
              >
                ⏹ Stop & Send ({recordSecs}s)
              </button>
              <button
                type="button"
                className="tiny-btn"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: "rgba(255, 75, 92, 0.12)",
                  borderColor: "rgba(255, 75, 92, 0.35)",
                  color: "#ff4b5c",
                }}
                onClick={cancelRecording}
              >
                ✖ Cancel
              </button>
            </div>
          </div>
        )}

        {/* Mobile Insecure Context Warning */}
        {typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" && (
          <div
            style={{
              background: "rgba(240, 166, 60, 0.12)",
              border: "1px solid rgba(240, 166, 60, 0.4)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 10,
              fontSize: 12,
              color: "var(--elevated)",
              lineHeight: 1.4,
            }}
          >
            ⚠️ <strong>Mobile Mic Notice:</strong> Mobile browsers require HTTPS for microphone recording.
            <div style={{ marginTop: 4 }}>
              <a
                href={`https://${window.location.host}${window.location.pathname}`}
                style={{ color: "var(--signal)", fontWeight: 700, textDecoration: "underline" }}
              >
                Tap here to switch to HTTPS ({window.location.host}) ↗
              </a>
            </div>
          </div>
        )}

        {/* Media Buttons (Shown when not recording) */}
        {!recording && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className="tiny-btn"
              style={{ flex: 1, padding: "10px", fontSize: 13, fontWeight: 700 }}
              onClick={pickImage}
              disabled={!joined || !online}
            >
              🖼️ Image Note
            </button>
            <button
              type="button"
              className="tiny-btn"
              style={{
                flex: 1,
                padding: "10px",
                fontSize: 13,
                fontWeight: 700,
              }}
              onClick={toggleRecording}
              disabled={!joined || !online}
            >
              🎤 Voice Note
            </button>
          </div>
        )}

        {/* Hidden File Input for Image Upload (Always Present in DOM) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageFile}
        />

        {Object.entries(mediaProgress).map(([id, p]) => (
          <div key={id} style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--signal)", marginBottom: 8 }}>
            Receiving {p.kind}… {p.received}/{p.total} chunks
          </div>
        ))}

        <button
          className="send-btn"
          id="send-btn"
          onClick={send}
          style={{ fontSize: 14, padding: "12px", fontWeight: 800 }}
          disabled={!joined || !online || !text.trim() || !target}
        >
          Route Encrypted Message →
        </button>
      </div>

      {/* 3. Broadcast GPS Location */}
      <div className="cloud-section" style={{ margin: "14px 16px 10px" }}>
        <div className="cloud-header">
          <span className="cloud-title" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <svg className="section-icon-svg location-icon-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="1" x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="23"/>
              <line x1="1" y1="12" x2="4" y2="12"/>
              <line x1="20" y1="12" x2="23" y2="12"/>
            </svg>
            Share Location With Everyone
          </span>
        </div>
        <input
          className="cloud-url-input"
          value={broadcastText}
          onChange={e => setBroadcastText(e.target.value)}
          placeholder="Message to send with your location"
          style={{ marginBottom: 10, fontSize: 13.5, padding: "9px 12px" }}
        />
        <button className="gps-broadcast-btn" onClick={shareLocationToAll} disabled={!joined || !online || broadcasting}>
          <svg className={`btn-svg ${broadcasting ? "spinning" : ""}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="3"/>
            <line x1="12" y1="1" x2="12" y2="4"/>
            <line x1="12" y1="20" x2="12" y2="23"/>
            <line x1="1" y1="12" x2="4" y2="12"/>
            <line x1="20" y1="12" x2="23" y2="12"/>
          </svg>
          {broadcasting ? "Broadcasting to all peers…" : `Broadcast Location to ${otherKnownNodes.length} Peer(s)`}
        </button>
      </div>

      {/* 4. Real-Time Network Log Section with Toggle Option */}
      <div className="log-container-wrapper">
        <div
          className="log-header-bar"
          onClick={() => setShowLog(v => !v)}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-dot pulse" style={{ width: 8, height: 8 }}></span>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text)", textTransform: "uppercase", fontFamily: "var(--mono)" }}>
              Real-Time Network Log
            </span>
            <span className="log-count-badge">
              {log.length}
            </span>
          </div>

          {/* Log Toggle Button */}
          <button
            type="button"
            className="btn-log-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setShowLog(v => !v);
            }}
          >
            {showLog ? "▲ Hide Log" : "▼ Show Log"}
          </button>
        </div>

        {showLog && (
          <div className="log">
            {log.length === 0 ? (
              <div className="log-empty-state">
                <div style={{ fontSize: 24, marginBottom: 4 }}>📡</div>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13, marginBottom: 2 }}>
                  Network Listener Active
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11.5, lineHeight: 1.4 }}>
                  Waiting for peer handshakes, topology adverts, and encrypted dispatches...
                </div>
              </div>
            ) : (
              log.map(entry => {
                const entryTime = entry.time || (entry.ts ? new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "");
                return (
                  <div className={`log-entry ${entry.tag || "system"}`} key={entry.id}>
                    <div className="log-entry-header">
                      <span className="tag">{entry.tag || "system"}</span>
                      {entryTime && <span className="log-time">{entryTime}</span>}
                    </div>
                    <div className="log-text">{entry.text}</div>
                    {entry.meta && <div className="path">{entry.meta}</div>}
                    {entry.mediaKind === "image" && entry.mediaUrl && (
                      <img
                        src={entry.mediaUrl}
                        alt="shared attachment"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "180px",
                          borderRadius: 8,
                          marginTop: 8,
                          display: "block",
                          border: "1px solid var(--glass-border)",
                        }}
                      />
                    )}
                    {entry.mediaKind === "voice" && entry.mediaUrl && (
                      <audio
                        controls
                        playsInline
                        preload="metadata"
                        src={entry.mediaUrl}
                        style={{ width: "100%", marginTop: 8, height: 36, borderRadius: 6 }}
                      />
                    )}
                    {entry.mapUrl && (
                      <div className="path" style={{ marginTop: 6 }}>
                        <a
                          href={entry.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--signal)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          📍 Open location in Google Maps ↗
                        </a>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
