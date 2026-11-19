import React, { useEffect, useState } from 'react';
import { Crosshair, Flame, Radio, ShieldAlert, Sparkles, X, Zap } from 'lucide-react';
import type { QuickChatCategory, QuickChatPreset } from '../types';

export const QUICK_CHAT_PRESETS: QuickChatPreset[] = [
  // Tactical
  { id: 't1', category: 'tactical', icon: '⚡', label: 'Rush B Site', text: '⚡ Rush B Site! Full execute now!', hotkey: 'Alt+1' },
  { id: 't2', category: 'tactical', icon: '🎯', label: 'Enemy 240° NW', text: '🎯 Enemy Spotted — 240° NW!', hotkey: 'Alt+2' },
  { id: 't3', category: 'tactical', icon: '🛡️', label: 'Hold Anchor', text: '🛡️ Hold Position & Anchor Site', hotkey: 'Alt+3' },
  { id: 't4', category: 'tactical', icon: '🔄', label: 'Rotate A', text: '🔄 Rotating to A Site — Watch Flank!', hotkey: 'Alt+4' },
  { id: 't5', category: 'tactical', icon: '💣', label: 'Plant Spike', text: '💣 Site Clear — Plant the Spike!', hotkey: 'Alt+5' },

  // Comms
  { id: 'c1', category: 'comms', icon: '🆘', label: 'Need Backup', text: '🆘 Need Backup Immediately!' },
  { id: 'c2', category: 'comms', icon: '🔋', label: 'Ult Ready', text: '🔋 Ultimate Ready (100%) — Let’s Combo!' },
  { id: 'c3', category: 'comms', icon: '💊', label: 'Drop Heals', text: '💊 Dropping Heals / Shields Here' },
  { id: 'c4', category: 'comms', icon: '💰', label: 'Eco Round', text: '💰 Eco / Save Round — Play Picks' },
  { id: 'c5', category: 'comms', icon: '🎤', label: 'Mic Check', text: '🎤 Mic Check — Squad Ready in Voice!' },

  // Hype
  { id: 'h1', category: 'hype', icon: '🔥', label: 'INSANE CLUTCH', text: '🔥 INSANE CLUTCH!! What a play!' },
  { id: 'h2', category: 'hype', icon: '👑', label: 'GG WP!', text: '👑 GG WP Squad! Clean dub!' },
  { id: 'h3', category: 'hype', icon: '🚀', label: "Let's Gooo", text: '🚀 LET’S GOOOO!! Momentum is ours!' },
  { id: 'h4', category: 'hype', icon: '💎', label: 'MVP Play', text: '💎 Absolute MVP round right there!' },
  { id: 'h5', category: 'hype', icon: '😂', label: 'Whiffed', text: '😂 NT NT! Almost had that!' },

  // Status
  { id: 's1', category: 'status', icon: '✅', label: 'Ready Queue', text: '✅ Ready for Match Queue!' },
  { id: 's2', category: 'status', icon: '⏳', label: 'AFK 2m', text: '⏳ Stepping away 2 mins — BRB' },
  { id: 's3', category: 'status', icon: '🎧', label: 'In Voice', text: '🎧 Hopping into Squad Voice Huddle!' },
  { id: 's4', category: 'status', icon: '📺', label: 'Watch Party', text: '📺 Watching the Live Stream Stage!' },
];

const CATEGORIES: { id: QuickChatCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'tactical', label: 'Tactical', icon: <Crosshair size={13} /> },
  { id: 'comms', label: 'Squad Comms', icon: <ShieldAlert size={13} /> },
  { id: 'hype', label: 'Hype', icon: <Flame size={13} /> },
  { id: 'status', label: 'Status', icon: <Radio size={13} /> },
];

interface QuickChatBarProps {
  onSendQuickChat: (preset: QuickChatPreset, zone?: string) => void;
  compact?: boolean;
  defaultOpen?: boolean;
}

const ZONES = ['Any Zone', 'A Site', 'Mid', 'B Site', 'Spawn', 'High Ground'];

export const QuickChatBar: React.FC<QuickChatBarProps> = ({
  onSendQuickChat,
  compact = false,
  defaultOpen = false,
}) => {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [cat, setCat] = useState<QuickChatCategory>('tactical');
  const [zone, setZone] = useState('Any Zone');
  const [cooldownId, setCooldownId] = useState<string | null>(null);

  const trigger = (preset: QuickChatPreset) => {
    setCooldownId(preset.id);
    onSendQuickChat(preset, zone !== 'Any Zone' ? zone : undefined);
    setTimeout(() => setCooldownId((prev) => (prev === preset.id ? null : prev)), 450);
  };

  // Keyboard shortcuts Alt+1..5
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const num = Number(e.key);
      if (num >= 1 && num <= 5) {
        const preset = QUICK_CHAT_PRESETS.filter((p) => p.category === 'tactical')[num - 1];
        if (preset) {
          e.preventDefault();
          trigger(preset);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const filtered = QUICK_CHAT_PRESETS.filter((p) => p.category === cat);

  return (
    <div className={`nc-quickchat-wrap ${compact ? 'compact' : ''}`}>
      <div className="nc-quickchat-strip">
        <button
          type="button"
          className={`nc-qc-toggle ${expanded ? 'active' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          title="In-Match Quick Chat Wheel & Callouts (Alt+1..5)"
        >
          <Zap size={14} />
          <span>Quick Chat</span>
          {!compact && <kbd>Alt+1..5</kbd>}
        </button>

        <div className="nc-qc-fast-row">
          {QUICK_CHAT_PRESETS.slice(0, compact ? 4 : 5).map((p) => (
            <button
              key={p.id}
              type="button"
              className={`nc-qc-chip ${cooldownId === p.id ? 'flash' : ''}`}
              onClick={() => trigger(p)}
              title={`${p.text}${p.hotkey ? ` (${p.hotkey})` : ''}`}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {expanded && (
          <button
            type="button"
            className="nc-icon-btn sm"
            onClick={() => setExpanded(false)}
            aria-label="Close quick chat panel"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="nc-qc-drawer">
          <div className="nc-qc-drawer-head">
            <div className="nc-qc-tabs">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`nc-qc-tab ${cat === c.id ? 'active' : ''}`}
                  onClick={() => setCat(c.id)}
                >
                  {c.icon}
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            <div className="nc-qc-zone">
              <Sparkles size={12} />
              <span>Map Zone:</span>
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="nc-qc-grid">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`nc-qc-card ${cooldownId === p.id ? 'flash' : ''}`}
                onClick={() => trigger(p)}
              >
                <div className="nc-qc-card-top">
                  <span className="nc-qc-card-icon">{p.icon}</span>
                  <span className="nc-qc-card-label">{p.label}</span>
                  {p.hotkey && <kbd>{p.hotkey}</kbd>}
                </div>
                <div className="nc-qc-card-preview">{p.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
