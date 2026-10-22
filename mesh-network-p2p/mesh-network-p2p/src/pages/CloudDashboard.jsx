import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export function CloudDashboard() {
  const [socket] = useState(() => io(import.meta.env.VITE_BACKEND_URL || undefined));
  const [data, setData] = useState({ nodes: [], events: [], aiModel: { version: 1, terms: {} }, summary: {} });
  const [connected, setConnected] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newWeight, setNewWeight] = useState(9);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("update", (payload) => setData(payload));
    socket.on("model_updated", (model) => {
      setData(d => ({ ...d, aiModel: model }));
    });
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("update");
      socket.off("model_updated");
    };
  }, [socket]);

  async function addTerm(e) {
    e.preventDefault();
    const word = newWord.trim().toLowerCase();
    if (!word || deploying) return;
    setDeploying(true);
    setDeployMsg("");
    try {
      const baseUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
      const res = await fetch(baseUrl ? `${baseUrl}/model` : "/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: { [word]: Number(newWeight) } }),
      });
      if (!res.ok) throw new Error("bad status");
      const model = await res.json();
      setData(d => ({ ...d, aiModel: model }));
      setDeployMsg(`✓ Model v${model.version} deployed ("${word}" → weight ${newWeight}). Mesh nodes will pull on next sync.`);
      setNewWord("");
    } catch (err) {
      setDeployMsg(`⚠ Failed to deploy model update (${err.message})`);
    } finally {
      setDeploying(false);
    }
  }

  const s = data.summary || {};
  const terms = Object.entries(data.aiModel?.terms || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="dashboard-wrap">
      {/* Top Header Bar */}
      <div className="topbar">
        <div className="brand">
          <div className="mark" style={{ fontSize: 12, letterSpacing: "0.14em", marginBottom: 6 }}>ZONESYNC // COMMAND CENTER</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "2px 0 6px" }}>Cloud Monitoring & AI Operations</h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Remote telemetry aggregator + hot model distribution engine</p>
        </div>
        <div className={`conn ${connected ? "live" : "down"}`}>
          <span className="dot-indicator"></span>
          {connected ? "● Live Stream Connected" : "○ Connecting to Cloud Server…"}
        </div>
      </div>

      {/* 5-Column Key Metric Cards */}
      <div className="grid-stats">
        <div className="stat-card">
          <div className="n">{s.reportingNodes ?? 0}</div>
          <div className="l">Reporting Nodes</div>
        </div>
        <div className="stat-card">
          <div className="n">{s.totalSent ?? 0}</div>
          <div className="l">Messages Sent</div>
        </div>
        <div className="stat-card">
          <div className="n">{s.totalDelivered ?? 0}</div>
          <div className="l">Delivered Across Mesh</div>
        </div>
        <div className="stat-card crit">
          <div className="n">{s.criticalCount ?? 0}</div>
          <div className="l">Critical (SOS) Traffic</div>
        </div>
        <div className="stat-card elev">
          <div className="n">{s.avgLatencyMs !== null && s.avgLatencyMs !== undefined ? `${s.avgLatencyMs}ms` : "—"}</div>
          <div className="l">Avg Link Latency</div>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="dashboard-cols">
        {/* Left Column: Nodes & Timeline */}
        <div>
          {/* Panel 1: Reporting Mesh Nodes */}
          <div className="dash-panel">
            <h2><span className="h-icon">📡</span> Reporting Mesh Nodes ({data.nodes.length})</h2>
            {data.nodes.length === 0 ? (
              <div className="empty" style={{ padding: "30px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>
                No mesh nodes are reporting telemetry right now.<br />
                Enable <strong>Cloud Sync</strong> in any node's sidebar to stream live metrics here.
              </div>
            ) : (
              data.nodes.map(n => {
                const fresh = Date.now() - (n.lastSync || 0) < 12000;
                return (
                  <div className="node-card" key={n.nodeId} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid var(--line)" }}>
                    <div className={`node-avatar ${fresh ? "fresh" : "stale"}`} style={{ fontSize: 16, color: fresh ? "var(--signal)" : "var(--muted)" }}>
                      {fresh ? "●" : "○"}
                    </div>
                    <div className="node-info" style={{ flex: 1 }}>
                      <div className="name" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                        {n.name} <span style={{ opacity: 0.6, fontSize: 12, fontFamily: "var(--mono)" }}>({n.nodeId})</span>
                      </div>
                      <div className="detail" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "var(--mono)" }}>
                        Topology: {n.topology?.nodeCount || 1} nodes known · Sent: {n.stats?.sent || 0} · Delivered: {n.stats?.delivered || 0}
                        {typeof n.stats?.avgRttMs === "number" && ` · Avg RTT: ${n.stats.avgRttMs}ms`}
                      </div>
                    </div>
                    <div className={`node-badge ${fresh ? "fresh" : "stale"}`} style={{
                      fontSize: 12, padding: "5px 12px", borderRadius: 14, fontWeight: 800, fontFamily: "var(--mono)",
                      background: fresh ? "rgba(51,214,166,0.15)" : "rgba(255,255,255,0.05)",
                      color: fresh ? "var(--signal)" : "var(--muted)",
                      border: `1px solid ${fresh ? "rgba(51,214,166,0.3)" : "var(--line)"}`
                    }}>
                      {fresh ? "ONLINE" : "STALE"}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Panel 2: Mesh Event Timeline */}
          <div className="dash-panel">
            <h2><span className="h-icon">📜</span> Real-Time Mesh Event Timeline</h2>
            <div className="timeline" style={{ maxHeight: 420, overflowY: "auto", padding: "12px 16px" }}>
              {data.events.length === 0 ? (
                <div className="empty" style={{ padding: "30px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
                  No live mesh events logged yet
                </div>
              ) : (
                data.events.map((evt, idx) => (
                  <div className={`event ${evt.type || ""}`} key={idx} style={{
                    fontSize: 13.5, padding: "10px 14px", borderRadius: 8, marginBottom: 8,
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", gap: 10
                  }}>
                    <span className="t" style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)", minWidth: 65 }}>
                      {new Date(evt.ts).toLocaleTimeString()}
                    </span>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>{evt.name || evt.nodeId}:</span>
                    <span style={{ flex: 1, color: "var(--text-secondary)" }}>{evt.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: AI Model Manager */}
        <div>
          <div className="dash-panel">
            <h2><span className="h-icon">🧠</span> AI Urgency Model Manager</h2>
            
            <div style={{ padding: "16px 22px 4px" }}>
              <div className="version-badge" style={{
                fontSize: 13.5, fontWeight: 700, color: "var(--signal)", background: "rgba(51,214,166,0.1)",
                padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(51,214,166,0.3)", display: "inline-block"
              }}>
                Active Model Version: <span className="v" style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--mono)" }}>v{data.aiModel?.version || 1}</span>
              </div>
            </div>

            <form onSubmit={addTerm} style={{ padding: "16px 22px" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, fontFamily: "var(--mono)", lineHeight: 1.5 }}>
                Add emergency keyword & urgency weight. Reporting mesh nodes pull updates automatically every 5s.
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <input
                  placeholder="e.g. landslide"
                  value={newWord}
                  onChange={e => setNewWord(e.target.value)}
                  style={{
                    flex: 1, minWidth: 160, padding: "11px 14px", borderRadius: 8,
                    background: "#0A0D14", border: "1px solid var(--line)",
                    color: "var(--text)", fontFamily: "var(--mono)", fontSize: 14
                  }}
                />
                <select
                  value={newWeight}
                  onChange={e => setNewWeight(e.target.value)}
                  style={{
                    padding: "11px 14px", borderRadius: 8,
                    background: "#0A0D14", border: "1px solid var(--line)",
                    color: "var(--text)", fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700
                  }}
                >
                  <option value={10}>10 (Critical)</option>
                  <option value={9}>9 (Critical)</option>
                  <option value={8}>8 (Critical)</option>
                  <option value={6}>6 (Elevated)</option>
                  <option value={4}>4 (Elevated)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={!newWord.trim() || deploying}
                style={{
                  width: "100%", padding: "12px 18px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, var(--signal) 0%, #28B890 100%)",
                  color: "#06120D", fontWeight: 800, fontFamily: "var(--sans)", fontSize: 14, cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(51,214,166,0.3)"
                }}
              >
                {deploying ? "Deploying Update…" : "⚡ Deploy Model Update"}
              </button>

              {deployMsg && (
                <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 13, color: "var(--signal)", background: "rgba(51,214,166,0.1)", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(51,214,166,0.3)" }}>
                  {deployMsg}
                </div>
              )}
            </form>

            <div style={{ padding: "0 22px 22px" }}>
              <div style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", fontFamily: "var(--mono)", fontWeight: 800, marginBottom: 12 }}>
                Current Urgency Keywords ({terms.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {terms.map(([term, w]) => (
                  <span
                    key={term}
                    style={{
                      fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                      background: w >= 8 ? "rgba(255,75,92,0.15)" : w >= 5 ? "rgba(240,166,60,0.15)" : "rgba(51,214,166,0.15)",
                      color: w >= 8 ? "var(--critical)" : w >= 5 ? "var(--elevated)" : "var(--signal)",
                      border: `1px solid ${w >= 8 ? "rgba(255,75,92,0.35)" : w >= 5 ? "rgba(240,166,60,0.35)" : "rgba(51,214,166,0.35)"}`
                    }}
                  >
                    {term} ({w})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
