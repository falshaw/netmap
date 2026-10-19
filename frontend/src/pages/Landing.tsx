import { Link } from "react-router-dom";
import {
  Map,
  ScanSearch,
  Network,
  FileOutput,
  Shield,
  ArrowRight,
  Play,
  Radar,
} from "lucide-react";

const features = [
  {
    icon: ScanSearch,
    title: "Multi-Protocol Discovery",
    description:
      "SNMP v2c/v3, nmap host detection, and ARP scanning to find every device on your network.",
  },
  {
    icon: Network,
    title: "Topology Mapping",
    description:
      "Automatic link discovery via CDP/LLDP, routing tables, and ARP caches. Interactive drag-and-drop canvas.",
  },
  {
    icon: FileOutput,
    title: "draw.io Export",
    description:
      "Export diagrams with Cisco-style shapes directly into draw.io XML format for documentation.",
  },
  {
    icon: Shield,
    title: "Firewall-Aware",
    description:
      "Identify firewalls, routers, switches, servers, and endpoints with vendor detection and interface details.",
  },
];

const stats = [
  { value: "10K+", label: "Devices Scanned" },
  { value: "6", label: "Protocols" },
  { value: "100%", label: "Automated" },
];

const benefits = [
  {
    title: "Zero Configuration",
    description:
      "Auto-discover your network topology. No agents, no manual mapping required.",
  },
  {
    title: "On-Premise Only",
    description:
      "Runs entirely in your infrastructure. No cloud dependencies, no data leaving your network.",
  },
  {
    title: "Vendor Agnostic",
    description:
      "Works with any network vendor — Cisco, Palo Alto, Fortinet, Juniper, and more.",
  },
  {
    title: "API-First Design",
    description:
      "Full REST API for automation. Integrate scans into your CI/CD or monitoring pipeline.",
  },
];

export default function Landing() {
  return (
    <div className="landing-page">
      {/* Animated Mesh Background */}
      <div className="mesh-bg">
        <div className="mesh-gradient mesh-1" />
        <div className="mesh-gradient mesh-2" />
        <div className="mesh-gradient mesh-3" />
        <div className="mesh-gradient mesh-4" />
      </div>

      {/* Floating Particles */}
      <div className="particles">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-container nav-inner">
          <div className="logo">
            <div className="logo-icon-box">
              <Map className="w-5 h-5 text-white" />
            </div>
            <span className="logo-text">
              Net<span>Map</span>
            </span>
          </div>
          <ul className="nav-links">
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#benefits">Benefits</a>
            </li>
          </ul>
          <div className="nav-cta">
            <Link to="/login" className="btn-landing-primary">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="landing-container hero-content">
          <div className="hero-text">
            <span className="hero-badge">
              <Radar className="w-4 h-4" />
              Network Intelligence
            </span>
            <h1 className="hero-title">
              Automated <span className="highlight">Network Topology</span>{" "}
              Discovery
            </h1>
            <p className="hero-description">
              Scan your network via SNMP, nmap, and ARP. Visualize topology in
              real-time with an interactive canvas. Export professional diagrams
              to draw.io with Cisco-style shapes.
            </p>
            <div className="hero-buttons">
              <Link to="/login" className="btn-landing-primary btn-large">
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#features" className="btn-landing-secondary btn-large">
                <Play className="w-5 h-5" />
                See How It Works
              </a>
            </div>
            <div className="hero-stats">
              {stats.map((stat) => (
                <div key={stat.label} className="stat">
                  <span className="stat-value">{stat.value}</span>
                  <span className="stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="landing-container">
          <div className="section-header">
            <span className="section-label">Features</span>
            <h2 className="section-title">Complete Network Visibility</h2>
            <p className="section-description">
              From discovery to documentation — everything you need to map and
              understand your network infrastructure.
            </p>
          </div>
          <div className="features-grid">
            {features.map(({ icon: Icon, title, description }, i) => (
              <div
                key={title}
                className="feature-card"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="feature-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="feature-title">{title}</h3>
                <p className="feature-description">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="benefits-section">
        <div className="landing-container">
          <div className="section-header">
            <span className="section-label">Why NetMap</span>
            <h2 className="section-title">Built for Network Engineers</h2>
          </div>
          <ul className="benefits-list">
            {benefits.map(({ title, description }) => (
              <li key={title} className="benefit-item">
                <div className="benefit-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="benefit-text">
                  <h4>{title}</h4>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="landing-container">
          <div className="cta-box">
            <div className="cta-orb cta-orb-1" />
            <div className="cta-orb cta-orb-2" />
            <h2 className="cta-title">Ready to Map Your Network?</h2>
            <p className="cta-description">
              Start scanning in minutes. No agents, no cloud dependencies. Just
              plug in and discover.
            </p>
            <div className="cta-buttons">
              <Link to="/login" className="btn-landing-primary btn-large">
                Launch NetMap
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container footer-inner">
          <div className="footer-brand">
            <div className="logo">
              <div className="logo-icon-box">
                <Map className="w-4 h-4 text-white" />
              </div>
              <span className="logo-text">
                Net<span>Map</span>
              </span>
            </div>
            <p>Automated network topology discovery.</p>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 NetMap contributors. MIT licensed.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
