import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { PulseSeekerPanel } from "../components/PulseSeekerPanel.jsx";
import { JoinModal } from "../components/JoinModal.jsx";
import { uid } from "../services/urgencyClassifier.js";
import { MeshNode } from "../services/meshNode.js";
import { MessagePopups } from "../components/MessagePopups.jsx";

export function PulseSeekerView() {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });
  const [selfId] = useState(() => uid());
  const [joined, setJoined] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem("mesh_joined") === "true" && (localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name")));
    } catch (e) {
      return false;
    }
  });
  const [meshNode, setMeshNode] = useState(null);
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    if (!joined || !name) return;
    const socket = io(import.meta.env.VITE_BACKEND_URL || undefined);
    const node = new MeshNode(selfId, name, socket, {
      onTopology: () => {},
      onLog: () => {},
      onHop: () => {},
      onDelivered: (envelope) => {
        const loc = envelope.location;
        setPopups(prev => [
          {
            id: uid(),
            from: envelope.from,
            fromName: envelope.from,
            urgency: envelope.urgency,
            text: envelope.text,
            location: loc,
            mapUrl: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null,
            encrypted: envelope.encrypted,
            verified: envelope.verified,
            timestamp: Date.now(),
            hops: envelope.hops,
            latencyMs: envelope.latencyMs,
            path: envelope.path || envelope.route,
          },
          ...prev
        ].slice(0, 10));
      },
      onPeerState: () => {},
      onCloudStatus: () => {},
      onModel: () => {},
      onLocationStatus: () => {},
      onCryptoStatus: () => {},
      onIdentities: () => {},
      onMediaProgress: () => {},
      onMediaDelivered: () => {},
    });
    node.register();
    setMeshNode(node);

    return () => {
      node.destroy();
      socket.disconnect();
    };
  }, [joined, name, selfId]);

  function handleJoin(customName) {
    const finalName = (customName || name || "").trim();
    if (!finalName) return;
    setName(finalName);
    try {
      localStorage.setItem("mesh_node_name", finalName);
      sessionStorage.setItem("mesh_node_name", finalName);
      sessionStorage.setItem("mesh_joined", "true");
    } catch (e) {}
    setJoined(true);
  }

  if (!joined) {
    return <JoinModal name={name} setName={setName} onJoin={handleJoin} defaultMode="/pulseseeker" />;
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1280px", margin: "0 auto" }}>
      <PulseSeekerPanel meshNode={meshNode} />
      <MessagePopups
        popups={popups}
        onClearAll={() => setPopups([])}
        onDismiss={(id) => setPopups(prev => prev.filter(p => p.id !== id))}
      />
    </div>
  );
}
