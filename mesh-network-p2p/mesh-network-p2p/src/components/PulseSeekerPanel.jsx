import React, { useEffect, useRef, useState, useCallback } from "react";
import { PulseSeeker } from "../services/pulseSeeker.js";

// ─── Auto-Coordinate Share: called when PulseSeeker detects critical score ───
async function shareCoordinatesAutomatically(detection, meshNode, onAutoShare) {
  let coords = detection.location;

  // Try live GPS first
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 10000,
        })
      );
      coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        ts: Date.now(),
      };
    } catch (_) {}
  }

  const mapUrl = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
  const alertText = `🚨 INERTIA SENSE CRITICAL ALERT — ${detection.type.toUpperCase()} detected (${detection.confidence}% confidence). Auto-sharing coordinates: ${coords.lat}, ${coords.lng} | Map: ${mapUrl}`;

  // Broadcast via mesh if connected
  if (meshNode) {
    try {
      await meshNode.broadcastLocationToAll(alertText, coords);
    } catch (e) {}
  }

  // REST beacon
  try {
    const baseUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
    await fetch(baseUrl ? `${baseUrl}/api/auto-beacon` : "/api/auto-beacon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...detection, autoCoordShare: true, coords, mapUrl }),
    });
  } catch (_) {}

  if (onAutoShare) onAutoShare({ coords, mapUrl, detection, alertText });
}

export function PulseSeekerPanel({ meshNode }) {
  const seekerRef = useRef(null);

  const [status, setStatus] = useState({
    active: false,
    micOk: false,
    motionOk: false,
    errorMsg: null,
  });

  const [telemetry, setTelemetry] = useState({
    stillnessSec: 0,
    prediction: { tapping: 0.05, inertia: 0.02, normal: 0.9, noise: 0.03, topClass: "normal" },
    features: new Array(25).fill(0),
    environment: "unknown",
  });

  const [beacons, setBeacons] = useState([]);
  const [autoShares, setAutoShares] = useState([]);
  const [activeTab, setActiveTab] = useState("telemetry");
  const [autoShareActive, setAutoShareActive] = useState(true);
  const autoShareRef = useRef(true);

  // Local alert popup shown on the detecting device itself
  const [localAlert, setLocalAlert] = useState(null);

  const isLocalIpInsecure =
    typeof window !== "undefined" &&
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  // Keep ref in sync with state
  useEffect(() => {
    autoShareRef.current = autoShareActive;
  }, [autoShareActive]);

  // Request browser Notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  const handleAutoCoordShare = useCallback(({ coords, mapUrl, detection, alertText }) => {
    const shareEntry = {
      id: `share-${Date.now()}`,
      coords,
      mapUrl,
      detection,
      alertText,
      timestamp: Date.now(),
    };
    setAutoShares(prev => [shareEntry, ...prev].slice(0, 20));
    setActiveTab("beacons");

    // 1. Show LOCAL alert popup on the detecting device
    setLocalAlert({
      id: shareEntry.id,
      type: detection.type,
      confidence: detection.confidence,
      coords,
      mapUrl,
      alertText,
      timestamp: Date.now(),
    });

    // 2. Fire Browser Push Notification so it appears even when tab is in background
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        const notif = new Notification("🚨 PulseSeeker Critical Alert", {
          body: `${detection.type.toUpperCase()} detected (${detection.confidence}% confidence)\nCoords: ${coords.lat}, ${coords.lng}`,
          icon: "/favicon.ico",
          tag: "inertia-alert",
          requireInteraction: true,
        });
        notif.onclick = () => {
          window.focus();
          if (mapUrl) window.open(mapUrl, "_blank");
          notif.close();
        };
      } catch (e) { /* Notification not supported on this context */ }
    }
  }, []);

  // Initialize PulseSeeker on mount
  useEffect(() => {
    const seeker = new PulseSeeker({
      meshNode,
      inertiaTimeoutMs: 180000, // 3 minutes of verified immobility
    });
    seekerRef.current = seeker;

    seeker.init({
      onStatus: (st) => setStatus((prev) => ({ ...prev, ...st })),
      onTelemetry: (data) => setTelemetry(data),
      onDetection: (detection) => {
        setBeacons((prev) => [detection, ...prev].slice(0, 30));

        // ─── AUTO COORDINATE SHARE on critical detection ───
        const confidence = detection.confidence || 0;
        if (autoShareRef.current && confidence >= 80) {
          shareCoordinatesAutomatically(detection, meshNode, handleAutoCoordShare);
        }
      },
      onError: (err) => console.warn("[PulseSeeker]", err),
    });

    return () => {
      seeker.stop();
    };
  }, [meshNode, handleAutoCoordShare]);

  function handleActivateSensors() {
    if (seekerRef.current) {
      seekerRef.current.init({
        onStatus: (st) => setStatus((prev) => ({ ...prev, ...st })),
        onTelemetry: (data) => setTelemetry(data),
        onDetection: (detection) => {
          setBeacons((prev) => [detection, ...prev].slice(0, 30));
          const confidence = detection.confidence || 0;
          if (autoShareRef.current && confidence >= 80) {
            shareCoordinatesAutomatically(detection, meshNode, handleAutoCoordShare);
          }
        },
      });
    }
  }

  function handleSimulateTapping() {
    if (seekerRef.current) {
      seekerRef.current.simulateTapping();
    }
  }

  function handleSimulateInertia() {
    if (seekerRef.current) {
      seekerRef.current.simulateInertia();
    }
  }

  function handleTriggerAutoBeacon() {
    if (seekerRef.current) {
      seekerRef.current.triggerDetection("unconscious", 0.95, telemetry.features, true); // isManual=true
    }
  }

  const tappingPct = Math.round((telemetry.prediction?.tapping || 0) * 100);
  const inertiaPct = Math.round((telemetry.prediction?.inertia || 0) * 100);
  const isCritical = tappingPct >= 80 || inertiaPct >= 80;

  return (
    <div className="pulseseeker-container">

      {/* ─── LOCAL DEVICE CRITICAL ALERT BANNER ─── */}
      {localAlert && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "linear-gradient(135deg, rgba(255,30,50,0.97), rgba(180,0,30,0.97))",
          color: "#fff",
          padding: "18px 20px",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          boxShadow: "0 4px 32px rgba(255,30,50,0.6)",
          animation: "slideDown 0.4s cubic-bezier(.4,0,.2,1)",
          borderBottom: "2px solid rgba(255,100,120,0.7)",
        }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, letterSpacing: 0.5 }}>
              INERTIASENSE AUTO-DETECTED: {localAlert.type.toUpperCase()} ({localAlert.confidence}% confidence)
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
              📍 Coordinates: <strong>{localAlert.coords.lat}, {localAlert.coords.lng}</strong>
              {localAlert.coords.accuracy && ` (±${localAlert.coords.accuracy}m)`}
              &nbsp;·&nbsp;
              <a href={localAlert.mapUrl} target="_blank" rel="noopener noreferrer"
                style={{ color: "#FFD0D5", textDecoration: "underline" }}>Open in Google Maps →</a>
            </div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>
              ✓ Broadcast sent to all connected mesh devices · {new Date(localAlert.timestamp).toLocaleTimeString()}
            </div>
          </div>
          <button
            onClick={() => setLocalAlert(null)}
            style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontSize: 13, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap"
            }}
          >✕ Dismiss</button>
        </div>
      )}
      {/* PulseSeeker Header */}
      <div className="pulseseeker-header">
        <div className="pulseseeker-title">
          <h2>🔬 PulseSeeker — AI Motion & Passive Detection</h2>
          <div className="pulseseeker-subtitle">
            Zero-Interaction Smart Sensing · Acoustic Tapping & Inertia Monitoring · Auto Coordinate Broadcast
          </div>
        </div>

        <div className="pulseseeker-badges">
          {status.active ? (
            <span className="status-tag status-active">● Detection Active</span>
          ) : (
            <span className="status-tag status-off">○ Standby / Requires Activation</span>
          )}
          <span className="status-tag status-env">📍 Env: {telemetry.environment}</span>
          {isCritical && (
            <span className="status-tag" style={{ background: "rgba(255,75,92,0.2)", color: "#FF4B5C", border: "1px solid rgba(255,75,92,0.5)", animation: "dotPulse 1s ease-in-out infinite" }}>
              🚨 CRITICAL SCORE
            </span>
          )}
        </div>
      </div>

      {/* Auto Coordinate Share Toggle */}
      <div className="pulseseeker-notice" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span>
          🔬 <strong>PulseSeeker:</strong> Monitors motion & acoustic signals. When detection confidence hits <strong>≥80%</strong>, coordinates are <strong>automatically shared</strong> across the mesh network — no user action needed.
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-secondary)" }}>AUTO COORD SHARE</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoShareActive}
              onChange={e => setAutoShareActive(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </label>
      </div>

      {/* Insecure Context Warning */}
      {isLocalIpInsecure && (
        <div className="pulseseeker-warning">
          🔒 <strong>Browser Security Constraint (Local IP Access):</strong><br />
          You are opening over HTTP local IP (<code>{window.location.host}</code>). Browsers disable microphone access on HTTP over local IP.<br />
          <em>Use the <strong>"⚡ Simulation Suite"</strong> buttons below to test tapping detection, inertia alerts, and auto-coordinate broadcasting!</em>
        </div>
      )}

      {/* Primary Action & Navigation Controls */}
      <div className="pulseseeker-actions">
        <div className="action-buttons">
          {!status.active && (
            <button className="primary-btn pulse" onClick={handleActivateSensors}>
              🔬 Activate PulseSeeker Detection
            </button>
          )}

          <button className="secondary-btn" onClick={handleSimulateTapping}>
            🔨 Simulate Tapping (3.2 Hz)
          </button>

          <button className="secondary-btn" onClick={handleSimulateInertia}>
            🛌 Simulate Inertia (&gt;5m Stillness)
          </button>

          <button className="danger-btn" onClick={handleTriggerAutoBeacon}>
            🚨 Trigger Auto-Beacon + Coordinates
          </button>
        </div>

        <div className="view-tabs">
          <button className={`tab-btn ${activeTab === "telemetry" ? "active" : ""}`} onClick={() => setActiveTab("telemetry")}>
            📊 Sensor Telemetry
          </button>

          <button className={`tab-btn ${activeTab === "beacons" ? "active" : ""}`} onClick={() => setActiveTab("beacons")}>
            🚨 Beacons & Coord Shares ({beacons.length + autoShares.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Sensor Telemetry & AI Inference */}
      {activeTab === "telemetry" && (
        <div className="telemetry-grid">
          {/* Tapping Confidence Card */}
          <div className="metric-card" style={{ border: tappingPct >= 80 ? "1px solid rgba(255,75,92,0.5)" : undefined }}>
            <div className="metric-label">Rhythmic Tapping Pattern</div>
            <div className="metric-value" style={{ color: tappingPct > 70 ? "#FF4B5C" : "#33D6A6" }}>
              {tappingPct}%
              {tappingPct >= 80 && <span style={{ fontSize: 12, marginLeft: 8 }}>🚨 AUTO SHARE</span>}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${tappingPct}%`, background: tappingPct > 70 ? "#FF4B5C" : "#33D6A6" }} />
            </div>
            <div className="metric-sub">Detects 2-4 Hz periodic taps · ≥80% triggers auto coordinate broadcast</div>
          </div>

          {/* Inertia / Motionlessness Card */}
          <div className="metric-card" style={{ border: inertiaPct >= 80 ? "1px solid rgba(255,75,92,0.5)" : undefined }}>
            <div className="metric-label">Inertia / Unconsciousness Score</div>
            <div className="metric-value" style={{ color: telemetry.stillnessSec > 300 ? "#FF4B5C" : "#529CFF" }}>
              {telemetry.stillnessSec}s
              {inertiaPct >= 80 && <span style={{ fontSize: 12, marginLeft: 8 }}>🚨 AUTO SHARE</span>}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(100, (telemetry.stillnessSec / 300) * 100)}%`, background: "#529CFF" }} />
            </div>
            <div className="metric-sub">Monitors complete stillness (&gt;5 mins = unconscious alert) · Auto-broadcasts coordinates</div>
          </div>

          {/* Environmental Classification Card */}
          <div className="metric-card">
            <div className="metric-label">Environmental Classifier</div>
            <div className="metric-value" style={{ fontSize: "20px", color: "#F0A63C" }}>
              {telemetry.environment.toUpperCase()}
            </div>
            <div className="metric-sub">Identifies zone type based on acoustic damping & sensor proxies</div>
          </div>

          {/* Auto-Share Status */}
          <div className="metric-card" style={{ background: autoShareActive ? "rgba(51,214,166,0.05)" : undefined }}>
            <div className="metric-label">Auto-Coordinate Broadcast</div>
            <div className="metric-value" style={{ fontSize: 18, color: autoShareActive ? "#33D6A6" : "#6C7F96" }}>
              {autoShareActive ? "🟢 ENABLED" : "⚪ DISABLED"}
            </div>
            <div className="metric-sub">
              {autoShareActive
                ? `Active: coordinates broadcast automatically when score ≥80% (${autoShares.length} shares sent)`
                : "Enable to auto-broadcast GPS coordinates on critical detections"}
            </div>
          </div>

          {/* Spectral Sub-band Energies Visualizer */}
          <div className="spectrum-card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-title">Acoustic Spectrum & MFCC Features (25 Dimensions)</div>
            <div className="bars-container">
              {telemetry.features.slice(0, 15).map((val, idx) => (
                <div key={idx} className="bar-wrapper">
                  <div className="bar-fill" style={{ height: `${Math.min(100, val * 100)}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Survivor Beacons + Auto-Coord Shares Feed */}
      {activeTab === "beacons" && (
        <div className="beacons-feed">
          {/* Auto Coordinate Shares Section */}
          {autoShares.length > 0 && (
            <>
              <h3 style={{ color: "#FF4B5C", marginBottom: 10 }}>📍 Auto-Shared Coordinates ({autoShares.length})</h3>
              <div className="beacons-list" style={{ marginBottom: 20 }}>
                {autoShares.map((share) => (
                  <div key={share.id} className="beacon-card" style={{ border: "1px solid rgba(255,75,92,0.4)", background: "rgba(255,75,92,0.05)" }}>
                    <div className="beacon-header">
                      <span className="beacon-type">🚨 Critical Auto-Broadcast</span>
                      <span className="beacon-conf" style={{ color: "#FF4B5C" }}>{share.detection.confidence}% Confidence</span>
                    </div>
                    <div className="beacon-body">
                      <div>📍 <strong>Coordinates:</strong> {share.coords.lat}, {share.coords.lng} (±{share.coords.accuracy || "~12"}m)</div>
                      <div>🗺️ <a href={share.mapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4B9EFF" }}>Open in Google Maps →</a></div>
                      <div>🔬 <strong>Trigger:</strong> {share.detection.type} detection</div>
                      <div>⏱ <strong>Timestamp:</strong> {new Date(share.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <div className="beacon-footer">
                      <span className="beacon-tag">✓ Auto-Broadcast via ZoneSync Mesh Network</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>🔬 PulseSeeker Detection Beacons ({beacons.length})</h3>

          {beacons.length === 0 && autoShares.length === 0 ? (
            <div className="empty-beacons">
              No detection beacons triggered yet.<br />
              Click <strong>"🔨 Simulate Tapping"</strong> or <strong>"🚨 Trigger Auto-Beacon + Coordinates"</strong> to test live beacon generation with coordinate broadcasting!
            </div>
          ) : (
            <div className="beacons-list">
              {beacons.map((b) => (
                <div key={b.id} className="beacon-card">
                  <div className="beacon-header">
                    <span className="beacon-type">
                      {b.type === "tapping" ? "🔨 Rhythmic Tapping Detected" : "🛌 Unconscious Survivor Alert"}
                    </span>
                    <span className="beacon-conf">{b.confidence}% Confidence</span>
                  </div>

                  <div className="beacon-body">
                    <div>📍 <strong>Location:</strong> {b.location.lat}, {b.location.lng} (±{b.location.accuracy}m)</div>
                    <div>🏢 <strong>Environment:</strong> {b.environment}</div>
                    <div>⏱ <strong>Timestamp:</strong> {new Date(b.timestamp).toLocaleTimeString()}</div>
                    {b.confidence >= 80 && (
                      <div style={{ color: "#33D6A6", fontSize: 11, marginTop: 4 }}>
                        ✓ Coordinates automatically broadcast via ZoneSync mesh
                      </div>
                    )}
                  </div>

                  <div className="beacon-footer">
                    <span className="beacon-tag">✓ Auto-Sent via ZoneSync P2P Network & REST API</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
