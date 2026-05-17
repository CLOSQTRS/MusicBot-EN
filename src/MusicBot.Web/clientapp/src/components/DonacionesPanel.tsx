import React from "react";
import { ExternalLink, Heart, Coffee, Star, Zap } from "lucide-react";

interface DonationOption {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
}

const SUSCRIPCIONES: DonationOption[] = [
  {
    id: "kofi",
    name: "Ko-fi",
    description: "Support with a monthly membership and help keep MusicBot actively developed.",
    url: "https://ko-fi.com/overabstractor",
    icon: <Coffee size={22} />,
    color: "#29abe0",
    badge: "From $3/month",
  },
  {
    id: "patreon",
    name: "Patreon",
    description: "Join as a member on Patreon and contribute directly to the ongoing development of MusicBot.",
    url: "https://www.patreon.com/overabstractor",
    icon: <Star size={22} />,
    color: "#ff424d",
    badge: "Monthly membership",
  },
];

const UNICA: DonationOption[] = [
  {
    id: "paypal",
    name: "PayPal",
    description: "Send a one-time donation for any amount. Quick, no commitment.",
    url: "https://paypal.me/OverAbstractor",
    icon: <Zap size={22} />,
    color: "#009cde",
    badge: "No subscription",
  },
];

export const DonacionesPanel: React.FC = () => {
  const openUrl = (url: string) => {
    fetch(`/api/auth/open-in-browser?url=${encodeURIComponent(url)}`, { method: "POST" }).catch(() => {
      window.open(url, "_blank");
    });
  };

  const renderCard = (p: DonationOption, cta: string) => (
    <div key={p.id} className="donacion-card">
      <div className="donacion-card-icon" style={{ color: p.color }}>
        {p.icon}
      </div>
      <div className="donacion-card-body">
        <div className="donacion-card-name-row">
          <span className="donacion-card-name">{p.name}</span>
          {p.badge && <span className="donacion-badge">{p.badge}</span>}
        </div>
        <span className="donacion-card-desc">{p.description}</span>
      </div>
      <button className="btn btn-outline donacion-btn" onClick={() => openUrl(p.url)}>
        {cta} <ExternalLink size={13} />
      </button>
    </div>
  );

  return (
    <div className="donaciones-panel">
      {/* Header */}
      <div className="donaciones-header">
        <div className="donaciones-icon">
          <Heart size={32} fill="currentColor" />
        </div>
        <h2 className="donaciones-title">Support MusicBot</h2>
        <p className="donaciones-subtitle">
          MusicBot is a free project made with a lot of effort. If you find it useful,
          consider supporting the development — with a monthly subscription or a one-time donation.
        </p>
      </div>

      {/* Subscriptions */}
      <div className="donaciones-section">
        <div className="donaciones-section-header">
          <span className="donaciones-section-title">Subscriptions & memberships</span>
          <span className="donaciones-section-sub">Monthly recurring support</span>
        </div>
        <div className="donaciones-cards">
          {SUSCRIPCIONES.map(p => renderCard(p, "Subscribe"))}
        </div>
      </div>

      {/* One-time donation */}
      <div className="donaciones-section">
        <div className="donaciones-section-header">
          <span className="donaciones-section-title">One-time donation</span>
          <span className="donaciones-section-sub">No commitment, any amount you want</span>
        </div>
        <div className="donaciones-cards">
          {UNICA.map(p => renderCard(p, "Donate"))}
        </div>
      </div>

      {/* Footer */}
      <div className="donaciones-note">
        All donations are voluntary and do not condition access to any feature. Thank you for your support!
      </div>
    </div>
  );
};
