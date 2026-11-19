import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Crosshair, Gamepad2, Headphones, MapPin, Shield, Users } from 'lucide-react';
import type { Server, SquadLobbyState, User } from '../types';
import { Avatar } from './Avatar';

interface SquadLobbyBannerProps {
  server: Server;
  channelId: string;
  me: User;
  users: Record<string, User>;
  squadState?: SquadLobbyState;
  onUpdateSquad: (patch: { game?: string; map?: string; ready?: boolean }) => void;
  onMapPing: (x: number, y: number, label: string) => void;
  onJoinSquadVoice: () => void;
}

const GAMES = [
  'VALORANT • Competitive',
  'Counter-Strike 2 • Premier',
  'Apex Legends • Ranked Trios',
  'League of Legends • Clash',
  'Fortnite • Squads',
];

const MAPS = ['Ascent', 'Bind', 'Mirage', 'Storm Point', 'Summoner’s Rift'];

const MAP_ZONES = [
  { x: 24, y: 24, label: 'A Site' },
  { x: 50, y: 48, label: 'Mid Control' },
  { x: 76, y: 26, label: 'B Site' },
  { x: 26, y: 74, label: 'A Main' },
  { x: 74, y: 72, label: 'B Main' },
];

export const SquadLobbyBanner: React.FC<SquadLobbyBannerProps> = ({
  server,
  me,
  users,
  squadState,
  onUpdateSquad,
  onMapPing,
  onJoinSquadVoice,
}) => {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );
  const [showMinimap, setShowMinimap] = useState(false);
  const [lastPing, setLastPing] = useState<{ x: number; y: number; label: string } | null>(null);

  const game = squadState?.game || GAMES[0];
  const map = squadState?.map || MAPS[0];
  const readyMap = squadState?.ready || {};
  const myReady = !!readyMap[me.id];

  // Build up to 4 featured squad slots (me first, then up to 3 active members)
  const squadMembers: User[] = [me];
  for (const m of server.members) {
    if (m.userId === me.id) continue;
    const u = users[m.userId];
    if (u && squadMembers.length < 4) squadMembers.push(u);
  }

  const readyCount = squadMembers.filter((u) => readyMap[u.id]).length;
  const voiceChannel = server.channels.find((c) => c.type === 'voice');
  const activeVoiceCount = voiceChannel ? (server.voiceStates[voiceChannel.id]?.length || 0) : 0;

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    // Find nearest zone label
    let nearest = 'Sector';
    let bestDist = 9999;
    for (const z of MAP_ZONES) {
      const d = Math.hypot(x - z.x, y - z.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = z.label;
      }
    }
    const label = bestDist < 22 ? nearest : `Grid (${x}, ${y})`;
    setLastPing({ x, y, label });
    onMapPing(x, y, label);
  };

  return (
    <div className={`nc-squad-banner ${collapsed ? 'collapsed' : ''}`}>
      <div className="nc-squad-top">
        <div className="nc-squad-title-group">
          <div className="nc-squad-badge">
            <Gamepad2 size={15} />
            <span>SQUAD LOBBY</span>
          </div>
          <select
            className="nc-squad-select"
            value={game}
            onChange={(e) => onUpdateSquad({ game: e.target.value })}
          >
            {GAMES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            className="nc-squad-select desktop-only"
            value={map}
            onChange={(e) => onUpdateSquad({ map: e.target.value })}
          >
            {MAPS.map((m) => (
              <option key={m} value={m}>
                Map: {m}
              </option>
            ))}
          </select>
          <span className="nc-squad-ready-count">
            <Users size={13} />
            {readyCount}/{squadMembers.length} Ready
          </span>
        </div>

        <div className="nc-squad-actions">
          <button
            type="button"
            className={`nc-btn sm ${showMinimap ? 'primary' : 'secondary'} desktop-only`}
            onClick={() => setShowMinimap((v) => !v)}
          >
            <Crosshair size={14} />
            <span>Tactical Map</span>
          </button>
          {voiceChannel && (
            <button type="button" className="nc-btn sm green" onClick={onJoinSquadVoice}>
              <Headphones size={14} />
              <span>Huddle ({activeVoiceCount})</span>
            </button>
          )}
          <button
            type="button"
            className={`nc-btn sm ${myReady ? 'green' : 'primary'}`}
            onClick={() => onUpdateSquad({ ready: !myReady })}
          >
            <CheckCircle2 size={14} />
            <span>{myReady ? 'READY ✓' : 'Ready Up'}</span>
          </button>
          <button
            type="button"
            className="nc-icon-btn sm nc-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand Squad Lobby' : 'Collapse Squad Lobby'}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="nc-squad-body">
        <div className="nc-squad-slots">
          {Array.from({ length: 4 }).map((_, idx) => {
            const u = squadMembers[idx];
            if (!u) {
              return (
                <div key={idx} className="nc-squad-slot empty">
                  <div className="nc-squad-slot-empty-icon">+</div>
                  <div>
                    <div className="nc-slot-name">Open Squad Slot</div>
                    <div className="nc-slot-sub">Invite a teammate</div>
                  </div>
                </div>
              );
            }
            const isReady = !!readyMap[u.id];
            return (
              <div key={u.id} className={`nc-squad-slot ${isReady ? 'ready' : ''}`}>
                <Avatar user={u} size={32} showStatus />
                <div className="nc-slot-meta">
                  <div className="nc-slot-name">
                    {u.displayName}
                    {idx === 0 && <Shield size={11} className="nc-inline-ico" />}
                  </div>
                  <div className={`nc-slot-state ${isReady ? 'ok' : ''}`}>
                    {isReady ? '● READY IN LOBBY' : u.customStatus || 'Selecting loadout...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {showMinimap && (
          <div className="nc-tactical-map-card">
            <div className="nc-tactical-map-head">
              <span>Click anywhere on {map} radar to broadcast a Squad Ping via Nexconn Chat SDK</span>
              {lastPing && (
                <span className="nc-ping-pill">
                  <MapPin size={12} /> {lastPing.label} ({lastPing.x}, {lastPing.y})
                </span>
              )}
            </div>
            <div className="nc-tactical-radar" onClick={handleMapClick}>
              <div className="nc-radar-grid" />
              {MAP_ZONES.map((z) => (
                <span
                  key={z.label}
                  className="nc-radar-zone-label"
                  style={{ left: `${z.x}%`, top: `${z.y}%` }}
                >
                  {z.label}
                </span>
              ))}
              {lastPing && (
                <div
                  className="nc-radar-ping"
                  style={{ left: `${lastPing.x}%`, top: `${lastPing.y}%` }}
                >
                  <span className="nc-radar-pulse" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
