import React, { useRef, useEffect, useCallback } from 'react';

export function MeshCanvas({ nodes, links, activeHop, selfId, onNodeClick, linkMode }) {
  const canvasRef = useRef(null);
  const posRef = useRef({});
  const particlesRef = useRef([]);

  const layout = useCallback((width, height) => {
    const cx = width / 2, cy = height / 2;
    const r = Math.min(width, height) * 0.33;
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      posRef.current[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;

    function resize() {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      layout(rect.width, rect.height);
    }
    resize();
    window.addEventListener("resize", resize);

    if (activeHop) {
      const a = posRef.current[activeHop.from], b = posRef.current[activeHop.to];
      if (a && b) {
        for (let i = 0; i < 8; i++) {
          particlesRef.current.push({
            x: a.x, y: a.y,
            tx: b.x, ty: b.y,
            progress: -i * 0.07,
            urgency: activeHop.urgency,
            life: 1,
          });
        }
      }
    }

    function drawGrid(w, h) {
      const spacing = 36;
      ctx.strokeStyle = "rgba(0, 229, 255, 0.04)";
      ctx.lineWidth = 0.5;
      for (let x = spacing; x < w; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = spacing; y < h; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(0, 229, 255, 0.09)";
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          ctx.beginPath(); ctx.arc(x, y, 0.85, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    function draw() {
      t += 0.016;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);

      drawGrid(w, h);

      // Draw Links
      links.forEach(l => {
        const a = posRef.current[l.a], b = posRef.current[l.b];
        if (!a || !b) return;
        const quality = Math.max(0, 1 - l.weight / 300);
        const pulse = 0.5 + Math.sin(t * 1.8 + l.weight * 0.01) * 0.2;
        const congestion = l.congestion || "normal";
        const rgb = congestion === "congested" ? "255, 61, 90" : congestion === "watch" ? "255, 171, 64" : "0, 229, 255";

        // Outer glow
        ctx.strokeStyle = `rgba(${rgb}, ${0.05 + quality * 0.08 + (congestion !== "normal" ? 0.06 : 0)})`;
        ctx.lineWidth = 6 + quality * 4 + (congestion === "congested" ? 2 : 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        // Core line
        ctx.strokeStyle = `rgba(${rgb}, ${(0.25 + quality * 0.5) * (0.8 + pulse * 0.25)})`;
        ctx.lineWidth = 1.2 + quality * 1.8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        if (l.weight < 500) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.fillStyle = `rgba(${rgb}, ${0.65 + quality * 0.35})`;
          ctx.font = "600 10px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          const label = congestion === "normal" ? `${Math.round(l.weight)}ms` : `${Math.round(l.weight)}ms ⚠ ${congestion}`;
          ctx.fillText(label, mx, my - 7);
        }
      });

      // Active Hop Animation
      if (activeHop) {
        const a = posRef.current[activeHop.from], b = posRef.current[activeHop.to];
        if (a && b) {
          const color = activeHop.urgency === "critical" ? "#FF3D5A" : activeHop.urgency === "elevated" ? "#FFAB40" : "#00E5FF";
          const glowColor = activeHop.urgency === "critical" ? "rgba(255,61,90," : activeHop.urgency === "elevated" ? "rgba(255,171,64," : "rgba(0,229,255,";
          const prog = activeHop.progress;
          const px = a.x + (b.x - a.x) * prog, py = a.y + (b.y - a.y) * prog;

          ctx.strokeStyle = glowColor + "0.22)";
          ctx.lineWidth = 10;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.shadowColor = color;
          ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.shadowBlur = 0;

          ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2);
          ctx.fillStyle = glowColor + "0.28)"; ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 24;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Streamed Particles
      particlesRef.current = particlesRef.current.filter(p => {
        p.progress += 0.025;
        p.life -= 0.016;
        if (p.life <= 0 || p.progress > 1.2) return false;
        const px = p.x + (p.tx - p.x) * Math.max(0, p.progress);
        const py = p.y + (p.ty - p.y) * Math.max(0, p.progress);
        const color = p.urgency === "critical" ? "255,61,90" : p.urgency === "elevated" ? "255,171,64" : "0,229,255";
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${p.life * 0.75})`;
        ctx.fill();
        return true;
      });

      // Nodes
      nodes.forEach(n => {
        const p = posRef.current[n.id];
        if (!p) return;
        const isSelf = n.id === selfId;
        const nodeRadius = isSelf ? 20 : 15;

        if (!n.alive) {
          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#0A101A";
          ctx.strokeStyle = "#1E2B3C";
          ctx.lineWidth = 1.5;
          ctx.fill(); ctx.stroke();
        } else {
          const pulse = 0.5 + Math.sin(t * 2.2 + p.x * 0.01) * 0.5;

          // Outer pulse ripple
          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius + 8 + pulse * 4, 0, Math.PI * 2);
          ctx.fillStyle = isSelf ? "rgba(0, 229, 255, 0.06)" : "rgba(0, 229, 255, 0.02)";
          ctx.fill();

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius + 4, 0, Math.PI * 2);
          ctx.fillStyle = isSelf ? "rgba(0, 229, 255, 0.12)" : "rgba(0, 229, 255, 0.04)";
          ctx.fill();

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
          if (isSelf) {
            const grad = ctx.createRadialGradient(p.x - 3, p.y - 3, 0, p.x, p.y, nodeRadius);
            grad.addColorStop(0, "#80F4FF");
            grad.addColorStop(0.6, "#00E5FF");
            grad.addColorStop(1, "#0090B8");
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = "#0D1826";
          }
          ctx.strokeStyle = isSelf ? "#00E5FF" : `rgba(0, 229, 255, ${0.4 + pulse * 0.3})`;
          ctx.lineWidth = isSelf ? 2.8 : 1.8;
          ctx.shadowColor = "#00E5FF";
          ctx.shadowBlur = isSelf ? 18 : 6 + pulse * 6;
          ctx.fill(); ctx.stroke();
          ctx.shadowBlur = 0;

          if (!isSelf) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 229, 255, ${0.65 + pulse * 0.35})`;
            ctx.fill();
          }
        }

        ctx.fillStyle = n.alive ? "#F0F6FF" : "#4A5D73";
        ctx.font = `${isSelf ? 700 : 600} ${isSelf ? 12.5 : 11}px 'IBM Plex Mono', monospace`;
        ctx.textAlign = "center";
        ctx.fillText(n.name, p.x, p.y + nodeRadius + 18);

        if (isSelf && n.alive) {
          ctx.fillStyle = "rgba(0, 229, 255, 0.75)";
          ctx.font = "700 8.5px 'IBM Plex Mono', monospace";
          ctx.fillText("YOU (ACTIVE HOST)", p.x, p.y + nodeRadius + 30);
        }
      });

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [nodes, links, activeHop, selfId, layout]);

  function handleClick(e) {
    if (!linkMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (const n of nodes) {
      const p = posRef.current[n.id];
      if (!p) continue;
      if (Math.hypot(p.x - x, p.y - y) < 22) { onNodeClick(n.id); return; }
    }
  }

  return <canvas ref={canvasRef} onClick={handleClick} style={{ cursor: linkMode ? "crosshair" : "default" }} />;
}
