import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { JoinModal } from './JoinModal.jsx';

export function Navbar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  const [showModal, setShowModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const [nodeName, setNodeName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      try {
        const stored = localStorage.getItem("mesh_node_name") || "";
        if (stored !== nodeName) setNodeName(stored);
      } catch (e) {}
    }, 1000);
    return () => clearInterval(timer);
  }, [nodeName]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  function handleModalJoin(newName) {
    if (newName) setNodeName(newName);
    setShowModal(false);
  }

  return (
    <>
      {/* ─── Top Main Navigation Bar ─── */}
      <header className="nav-header">
        <div className="nav-brand-container">
          <NavLink to="/" className="nav-brand" style={{ textDecoration: 'none' }}>
            <span className="brand-icon">⚡</span>
            <span className="brand-text">ZoneSync</span>
            <span className="brand-tag">v3.0</span>
          </NavLink>
          <div className="system-live-badge hide-on-tiny">
            <span className="live-dot pulse"></span>
            <span className="live-text">ONLINE · {time}</span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="nav-links desktop-nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`} end>
            <span className="tab-icon">🌐</span> ZoneSync
          </NavLink>
          <NavLink to="/echolocate" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            <span className="tab-icon">📡</span> EchoLocate
          </NavLink>
          <NavLink to="/pulseseeker" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            <span className="tab-icon">🔬</span> PulseSeeker
          </NavLink>
          <NavLink to="/lifeboat" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            <span className="tab-icon">🚤</span> Lifeboat Routing
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            <span className="tab-icon">☁️</span> Cloud Dashboard
          </NavLink>
        </nav>

        {/* Right Side Header Controls */}
        <div className="nav-right-controls">
          <button
            type="button"
            className="role-pill-btn"
            onClick={() => setShowModal(true)}
            title="Switch Operational Role or Change Node Identity"
          >
            <span className="role-dot pulse"></span>
            <span className="role-label">{nodeName ? nodeName : "Join Network"}</span>
          </button>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="mobile-menu-toggle-btn"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label="Toggle Navigation Menu"
            title="Open Navigation Menu"
          >
            {mobileMenuOpen ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ─── Mobile Slide-Out Drawer & Backdrop ─── */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={`mobile-nav-drawer ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-drawer-header">
          <div className="drawer-brand">
            <span className="brand-icon">⚡</span>
            <span>ZoneSync Mesh Suite</span>
          </div>
          <button
            className="drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Device Identity Status in Drawer */}
        <div className="drawer-node-card">
          <div className="drawer-node-sub">CURRENT DEVICE IDENTITY</div>
          <div className="drawer-node-name">{nodeName || "Anonymous Node"}</div>
          <button
            className="drawer-action-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              setShowModal(true);
            }}
          >
            ⚡ Switch Role / Mode
          </button>
        </div>

        {/* Navigation Links in Drawer */}
        <div className="drawer-nav-list">
          <div className="drawer-section-title">SUITE MODULES</div>

          <NavLink to="/" className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`} end>
            <div className="drawer-item-icon">🌐</div>
            <div className="drawer-item-text">
              <div className="drawer-item-title">ZoneSync</div>
              <div className="drawer-item-desc">P2P Mesh Network Console & AI Dispatch</div>
            </div>
          </NavLink>

          <NavLink to="/echolocate" className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}>
            <div className="drawer-item-icon">📡</div>
            <div className="drawer-item-text">
              <div className="drawer-item-title">EchoLocate</div>
              <div className="drawer-item-desc">GPS-Free 3D Spatial Acoustic Radar</div>
            </div>
          </NavLink>

          <NavLink to="/pulseseeker" className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}>
            <div className="drawer-item-icon">🔬</div>
            <div className="drawer-item-text">
              <div className="drawer-item-title">PulseSeeker</div>
              <div className="drawer-item-desc">Acoustic Tapping & Auto Coordinate Broadcast</div>
            </div>
          </NavLink>

          <NavLink to="/lifeboat" className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}>
            <div className="drawer-item-icon">🚤</div>
            <div className="drawer-item-text">
              <div className="drawer-item-title">Lifeboat Routing</div>
              <div className="drawer-item-desc">Multi-Sensor Lethality & Priority Queues</div>
            </div>
          </NavLink>

          <NavLink to="/dashboard" className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}>
            <div className="drawer-item-icon">☁️</div>
            <div className="drawer-item-text">
              <div className="drawer-item-title">Cloud Dashboard</div>
              <div className="drawer-item-desc">Live Telemetry & Hot AI Model Distribution</div>
            </div>
          </NavLink>
        </div>

        <div className="drawer-footer">
          <div className="drawer-footer-status">
            <span className="live-dot pulse"></span>
            <span>WebRTC P2P Mesh · Port 4001 Online</span>
          </div>
        </div>
      </div>

      {/* ─── Bottom Mobile App Navigation Dock (Visible on Phones) ─── */}
      <nav className="mobile-bottom-dock">
        <NavLink to="/" className={({ isActive }) => `dock-tab ${isActive ? 'active' : ''}`} end>
          <span className="dock-icon">🌐</span>
          <span className="dock-label">ZoneSync</span>
        </NavLink>
        <NavLink to="/echolocate" className={({ isActive }) => `dock-tab ${isActive ? 'active' : ''}`}>
          <span className="dock-icon">📡</span>
          <span className="dock-label">EchoLocate</span>
        </NavLink>
        <NavLink to="/pulseseeker" className={({ isActive }) => `dock-tab ${isActive ? 'active' : ''}`}>
          <span className="dock-icon">🔬</span>
          <span className="dock-label">PulseSeeker</span>
        </NavLink>
        <NavLink to="/lifeboat" className={({ isActive }) => `dock-tab ${isActive ? 'active' : ''}`}>
          <span className="dock-icon">🚤</span>
          <span className="dock-label">Lifeboat</span>
        </NavLink>
        <button
          type="button"
          className={`dock-tab ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(v => !v)}
        >
          <span className="dock-icon">☰</span>
          <span className="dock-label">More</span>
        </button>
      </nav>

      {/* ─── Join / Role Modal ─── */}
      {showModal && (
        <JoinModal
          name={nodeName}
          setName={setNodeName}
          onJoin={handleModalJoin}
          defaultMode={location.pathname}
        />
      )}
    </>
  );
}
