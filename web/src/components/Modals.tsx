import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Gamepad2,
  Hash,
  KeyRound,
  LogOut,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Settings,
  Shield,
  Trash2,
  Tv,
  UserPlus,
  Video,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import type {
  NexconnConfig,
  SdkLogEntry,
  Server,
  User,
  UserStatus,
} from '../types';
import type { SdkConnectionMode } from '../services/nexconn';
import { api, getApiBase, setApiBase } from '../services/api';
import { Avatar } from './Avatar';

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#F47B67', '#3BA55C', '#FAA61A', '#9B84EE', '#1ABC9C'];

// ========================================================================= Auth Screen
interface AuthScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, displayName: string) => Promise<void>;
  onDemoLogin: (displayName?: string) => Promise<void>;
  onVerifyOtp: (phone: string, otp: string, displayName?: string) => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onRegister, onDemoLogin, onVerifyOtp }) => {
  const [authMethod, setAuthMethod] = useState<'mobile' | 'password'>('mobile');
  const [mobileStep, setMobileStep] = useState<'phone' | 'otp'>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Password fallback mode states
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [demoHandle, setDemoHandle] = useState('');
  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [showServerUrl, setShowServerUrl] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const fullPhone = `${countryCode.trim()}${phoneDigits.trim().replace(/^0+/, '')}`;

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr('');
    const cleanDigits = phoneDigits.replace(/\D/g, '');
    if (cleanDigits.length < 8) {
      setErr('Please enter a valid mobile number (at least 8-10 digits)');
      return;
    }
    setBusy(true);
    try {
      if (serverUrl.trim()) setApiBase(serverUrl.trim());
      await api.sendOtp(fullPhone);
      setMobileStep('otp');
      setCooldown(30);

      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e: any) {
      setErr(e?.message || 'Failed to send verification SMS');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setErr('Please enter the 6-digit verification code');
      return;
    }
    setBusy(true);
    try {
      if (serverUrl.trim()) setApiBase(serverUrl.trim());
      await onVerifyOtp(fullPhone, cleanOtp, displayName.trim() || undefined);
    } catch (e: any) {
      setErr(e?.message || 'Verification failed. Please check the code.');
    } finally {
      setBusy(false);
    }
  };

  const submitPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (serverUrl.trim()) setApiBase(serverUrl.trim());
      if (mode === 'login') await onLogin(username, password);
      else await onRegister(username, password, displayName || username);
    } catch (e: any) {
      setErr(e?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async () => {
    setErr('');
    setBusy(true);
    try {
      if (serverUrl.trim()) setApiBase(serverUrl.trim());
      await onDemoLogin(demoHandle.trim() || undefined);
    } catch (e: any) {
      setErr(e?.message || 'Demo login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nc-auth-bg">
      <div className="nc-auth-card">
        <div className="nc-auth-brand">
          <div className="nc-auth-logo">
            <Gamepad2 size={28} />
          </div>
          <div>
            <h1>Nexcord</h1>
            <p>Gaming, Squad Chat & Live Streams • Powered by Nexconn SDK</p>
          </div>
        </div>

        {/* Tab switcher: Mobile OTP (Primary) vs Password */}
        <div className="nc-auth-tabs">
          <button
            type="button"
            className={`nc-auth-tab ${authMethod === 'mobile' ? 'active' : ''}`}
            onClick={() => {
              setErr('');
              setAuthMethod('mobile');
            }}
          >
            <Phone size={14} />
            <span>Mobile OTP Login</span>
          </button>
          <button
            type="button"
            className={`nc-auth-tab ${authMethod === 'password' ? 'active' : ''}`}
            onClick={() => {
              setErr('');
              setAuthMethod('password');
            }}
          >
            <KeyRound size={14} />
            <span>Password / Demo</span>
          </button>
        </div>

        {authMethod === 'mobile' ? (
          <div>
            {mobileStep === 'phone' ? (
              <form onSubmit={handleSendOtp} className="nc-auth-form">
                <div style={{ textAlign: 'left', marginBottom: 6 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: '#f2f3f5' }}>
                    Verify Your Mobile Number
                  </h2>
                  <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
                    Enter your phone number to receive a 6-digit SMS verification code.
                  </p>
                </div>

                <label className="nc-field">
                  <span>MOBILE PHONE NUMBER</span>
                  <div className="nc-phone-input-row">
                    <input
                      className="nc-phone-prefix"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      placeholder="+91"
                      title="Country Dial Code"
                    />
                    <input
                      type="tel"
                      value={phoneDigits}
                      onChange={(e) => setPhoneDigits(e.target.value)}
                      placeholder="e.g. 98765 43210"
                      required
                      autoFocus
                    />
                  </div>
                </label>

                <label className="nc-field">
                  <span>DISPLAY NAME (OPTIONAL)</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Striker, Alex, Ghost"
                  />
                </label>

                {showServerUrl && (
                  <label className="nc-field">
                    <span>API SERVER URL</span>
                    <input
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="http://10.0.2.2:3001"
                    />
                  </label>
                )}

                {err && <div className="nc-error-banner">{err}</div>}

                <button type="submit" className="nc-btn primary full" disabled={busy}>
                  <Phone size={15} />
                  <span>{busy ? 'Sending SMS...' : 'Send SMS Verification Code'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="nc-auth-form">
                <div style={{ textAlign: 'left', marginBottom: 14 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: '#f2f3f5' }}>
                    Enter SMS Verification Code
                  </h2>
                  <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
                    An SMS with your 6-digit code was sent to <strong>{fullPhone}</strong> via Fast2SMS.
                  </p>
                </div>

                <label className="nc-field">
                  <span>6-DIGIT SMS CODE</span>
                  <input
                    className="nc-otp-input"
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="------"
                    autoFocus
                    required
                  />
                </label>

                {err && <div className="nc-error-banner">{err}</div>}

                <button type="submit" className="nc-btn green full" disabled={busy || otp.length < 4}>
                  <Check size={16} />
                  <span>{busy ? 'Verifying...' : 'Verify & Enter Homepage'}</span>
                </button>

                <div className="nc-otp-actions">
                  <button
                    type="button"
                    className="nc-link-btn"
                    onClick={() => {
                      setErr('');
                      setMobileStep('phone');
                    }}
                  >
                    ← Change Mobile Number
                  </button>
                  <button
                    type="button"
                    className="nc-link-btn"
                    disabled={cooldown > 0 || busy}
                    onClick={() => handleSendOtp()}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend SMS Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div>
            <div className="nc-demo-box">
              <div className="nc-demo-title">
                <Zap size={16} />
                <span>Instant Squad Entry (No Setup Needed)</span>
              </div>
              <div className="nc-demo-row">
                <input
                  value={demoHandle}
                  onChange={(e) => setDemoHandle(e.target.value)}
                  placeholder="Optional gamer tag (e.g. Striker)"
                />
                <button type="button" className="nc-btn green" disabled={busy} onClick={handleDemo}>
                  <Zap size={15} />
                  <span>Enter Arena</span>
                </button>
              </div>
            </div>

            <div className="nc-divider">
              <span>OR ACCOUNT LOGIN</span>
            </div>

            <form onSubmit={submitPasswordAuth} className="nc-auth-form">
              <label className="nc-field">
                <span>USERNAME</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. striker.gg"
                  required
                />
              </label>

              {mode === 'register' && (
                <label className="nc-field">
                  <span>DISPLAY NAME</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How your squad sees you"
                  />
                </label>
              )}

              <label className="nc-field">
                <span>PASSWORD</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                />
              </label>

              {err && <div className="nc-error-banner">{err}</div>}

              <button type="submit" className="nc-btn primary full" disabled={busy}>
                {busy ? 'Connecting...' : mode === 'login' ? 'Log In' : 'Create Account'}
              </button>
            </form>

            <div className="nc-auth-footer">
              <button
                type="button"
                className="nc-link-btn"
                onClick={() => {
                  setErr('');
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
              >
                {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Log In'}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button type="button" className="nc-link-btn muted" onClick={() => setShowServerUrl((v) => !v)}>
            {showServerUrl ? 'Hide Server URL' : 'Configure Server URL (for Mobile/LAN)'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================================================================= Nexconn SDK Console & Credentials
interface SdkConsoleModalProps {
  config: NexconnConfig;
  sdkMode: SdkConnectionMode;
  sdkDetail: string;
  logs: SdkLogEntry[];
  onSaveCredentials: (payload: { appKey: string; appSecret: string; apiHost: string; areaCode: number }) => Promise<{ error: string | null }>;
  onClose: () => void;
}

const DATA_CENTERS = [
  { label: 'Singapore (SG)', apiHost: 'api.sg-light-api.com', areaCode: 2 },
  { label: 'North America (NA)', apiHost: 'api.us-light-api.com', areaCode: 3 },
  { label: 'Saudi Arabia (SAU)', apiHost: 'api.sau-light-api.com', areaCode: 2 },
];

export const SdkConsoleModal: React.FC<SdkConsoleModalProps> = ({
  config,
  sdkMode,
  sdkDetail,
  logs,
  onSaveCredentials,
  onClose,
}) => {
  const [appKey, setAppKey] = useState(config.appKey || '');
  const [appSecret, setAppSecret] = useState('');
  const [dcIndex, setDcIndex] = useState(
    Math.max(0, DATA_CENTERS.findIndex((d) => d.apiHost === config.apiHost)),
  );
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSaving(true);
    try {
      const dc = DATA_CENTERS[dcIndex] || DATA_CENTERS[0];
      const res = await onSaveCredentials({
        appKey: appKey.trim(),
        appSecret: appSecret.trim(),
        apiHost: dc.apiHost,
        areaCode: dc.areaCode,
      });
      if (res.error) setErr(`Saved, but token test returned: ${res.error}`);
      else setMsg('Credentials saved & Nexconn SDK reconnected!');
    } catch (e: any) {
      setErr(e?.message || 'Failed to save credentials');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div className="nc-modal-title-ico">
            <Activity size={18} />
            <h3>Nexconn Chat SDK & Call SDK Console</h3>
          </div>
          <button type="button" className="nc-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="nc-modal-body">
          <div className="nc-sdk-status-card">
            <div>
              <div className="nc-sdk-badges-row">
                <span className={`nc-sdk-state ${sdkMode}`}>
                  {sdkMode === 'connected' ? '● LIVE NEXCONN EDGE' : '● HYBRID SDK MODE'}
                </span>
                <span className="nc-sdk-chip">@nexconn/chat 26.2.1</span>
                <span className="nc-sdk-chip">@nexconn/call 26.2.1</span>
                <span className="nc-sdk-chip">@nexconn/engine 26.2.1</span>
              </div>
              <p className="nc-sdk-detail">{sdkDetail}</p>
            </div>
          </div>

          <form className="nc-sdk-form" onSubmit={submit}>
            <div className="nc-sdk-form-title">
              <KeyRound size={14} />
              <span>Connect Your Nexconn Console App Key & Secret</span>
            </div>
            <div className="nc-grid-2">
              <label className="nc-field">
                <span>APP KEY</span>
                <input
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  placeholder="From console.nexconn.ai"
                  required
                />
              </label>
              <label className="nc-field">
                <span>APP SECRET (STORED SERVER-SIDE)</span>
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="Server signing secret"
                  required
                />
              </label>
            </div>
            <div className="nc-sdk-form-bottom">
              <label className="nc-field inline">
                <span>DATA CENTER</span>
                <select value={dcIndex} onChange={(e) => setDcIndex(Number(e.target.value))}>
                  {DATA_CENTERS.map((d, i) => (
                    <option key={d.label} value={i}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="nc-btn primary" disabled={saving}>
                {saving ? 'Connecting...' : 'Save & Connect Nexconn'}
              </button>
            </div>
            {msg && <div className="nc-ok-banner">{msg}</div>}
            {err && <div className="nc-error-banner">{err}</div>}
          </form>

          <div className="nc-sdk-logs">
            <div className="nc-sdk-logs-head">Live SDK Call Trace ({logs.length})</div>
            <div className="nc-sdk-logs-list">
              {logs.length === 0 ? (
                <div className="nc-muted">Send a message, quick chat, or start a call to trace SDK calls.</div>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className={`nc-sdk-log-row level-${l.level}`}>
                    <span className="nc-log-time">{new Date(l.ts).toLocaleTimeString()}</span>
                    <span className={`nc-log-pkg pkg-${l.sdk}`}>{l.sdk.toUpperCase()}</span>
                    <span className="nc-log-act">{l.action}</span>
                    <span className="nc-log-det">{l.detail}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========================================================================= Create / Join Server Modal
interface CreateServerModalProps {
  onCreate: (name: string, template: 'gaming' | 'standard') => Promise<void>;
  onJoinInvite: (code: string) => Promise<void>;
  onClose: () => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ onCreate, onJoinInvite, onClose }) => {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<'gaming' | 'standard'>('gaming');
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (tab === 'create') await onCreate(name.trim() || 'My Squad Server', template);
      else await onJoinInvite(invite.trim());
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <h3>{tab === 'create' ? 'Create Your Server' : 'Join a Server'}</h3>
          <button type="button" className="nc-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="nc-modal-tabs">
          <button type="button" className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            Create New Server
          </button>
          <button type="button" className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
            Join with Server ID / Invite
          </button>
        </div>

        <form className="nc-modal-body" onSubmit={submit}>
          {tab === 'create' ? (
            <>
              <label className="nc-field">
                <span>SERVER NAME</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Predators Club"
                  required
                  autoFocus
                />
              </label>
              <label className="nc-field">
                <span>TEMPLATE</span>
                <select value={template} onChange={(e) => setTemplate(e.target.value as 'gaming' | 'standard')}>
                  <option value="gaming">Gaming & Live Streams (Squad Room + Live Stage + Voice)</option>
                  <option value="standard">Standard Community (Text + Voice)</option>
                </select>
              </label>
            </>
          ) : (
            <label className="nc-field">
              <span>SERVER ID OR INVITE CODE</span>
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="Paste Server ID (e.g. g...) or Invite Code"
                required
                autoFocus
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Enter the unique Server ID or invite code shared with you to join instantly.
              </span>
            </label>
          )}
          {err && <div className="nc-error-banner">{err}</div>}
          <div className="nc-modal-actions">
            <button type="button" className="nc-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nc-btn primary" disabled={busy}>
              {busy ? 'Working...' : tab === 'create' ? 'Create Server' : 'Join Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================================================= Create Channel Modal
interface CreateChannelModalProps {
  server: Server;
  defaultCategoryId: string | null;
  onCreate: (payload: { name: string; type: string; categoryId: string | null; topic: string }) => Promise<void>;
  onClose: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  server,
  defaultCategoryId,
  onCreate,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId || server.categories[0]?.id || '');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), type, categoryId: categoryId || null, topic: topic.trim() });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <h3>Create Channel</h3>
          <button type="button" className="nc-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="nc-modal-body" onSubmit={submit}>
          <div className="nc-channel-type-grid">
            {[
              { id: 'text', label: 'Text', desc: 'Nexconn CommunitySubChannel', icon: <Hash size={18} /> },
              { id: 'voice', label: 'Voice', desc: 'Nexconn Call SDK Huddle', icon: <Volume2 size={18} /> },
              { id: 'live', label: 'Live Stage', desc: 'OpenChannel + Spectator Overlay', icon: <Tv size={18} /> },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nc-ch-type-opt ${type === item.id ? 'active' : ''}`}
                onClick={() => setType(item.id)}
              >
                {item.icon}
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.desc}</span>
                </div>
              </button>
            ))}
          </div>

          <label className="nc-field">
            <span>CHANNEL NAME</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'voice' ? 'Duo Queue' : 'new-channel'}
              required
            />
          </label>

          <label className="nc-field">
            <span>CATEGORY</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No Category</option>
              {server.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {type !== 'voice' && (
            <label className="nc-field">
              <span>TOPIC (OPTIONAL)</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this channel for?" />
            </label>
          )}

          <div className="nc-modal-actions">
            <button type="button" className="nc-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nc-btn primary" disabled={busy}>
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================================================= Server Settings Modal
interface ServerSettingsModalProps {
  server: Server;
  me: User;
  onUpdateServer: (patch: { name?: string; description?: string; iconColor?: string }) => Promise<void>;
  onCreateRole: (name: string, color: string, perms: Record<string, boolean>) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onRegenInvite: () => Promise<void>;
  onDeleteServer: () => Promise<void>;
  onClose: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  server,
  me,
  onUpdateServer,
  onCreateRole,
  onDeleteRole,
  onRegenInvite,
  onDeleteServer,
  onClose,
}) => {
  const [tab, setTab] = useState<'overview' | 'roles' | 'invites'>('overview');
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [iconColor, setIconColor] = useState(server.iconColor);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#5865F2');
  const [roleAdmin, setRoleAdmin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const isOwner = server.ownerId === me.id;

  const copyInvite = () => {
    navigator.clipboard?.writeText(server.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyServerId = () => {
    navigator.clipboard?.writeText(server.id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div className="nc-modal-title-ico">
            <ServerIcon size={18} />
            <h3>{server.name} — Server Settings</h3>
          </div>
          <button type="button" className="nc-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="nc-modal-tabs">
          <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>
            Roles ({server.roles.length})
          </button>
          <button type="button" className={tab === 'invites' ? 'active' : ''} onClick={() => setTab('invites')}>
            Invites
          </button>
        </div>

        <div className="nc-modal-body">
          {tab === 'overview' && (
            <>
              <div className="nc-field">
                <span>UNIQUE SERVER ID (FOR DIRECT JOIN)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <code style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 6, fontSize: 13, flex: 1 }}>{server.id}</code>
                  <button type="button" className="nc-btn sm primary" onClick={copyServerId}>
                    {copiedId ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId ? 'Copied ID!' : 'Copy Server ID'}</span>
                  </button>
                </div>
              </div>
              <label className="nc-field">
                <span>SERVER NAME</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="nc-field">
                <span>DESCRIPTION</span>
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="nc-field">
                <span>SERVER ICON COLOR</span>
                <div className="nc-color-row">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`nc-color-swatch ${iconColor === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setIconColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="nc-modal-actions spread">
                {isOwner ? (
                  <button
                    type="button"
                    className="nc-btn danger"
                    onClick={async () => {
                      await onDeleteServer();
                      onClose();
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Delete Server</span>
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="nc-btn primary"
                  onClick={async () => {
                    await onUpdateServer({ name, description, iconColor });
                    onClose();
                  }}
                >
                  Save Changes
                </button>
              </div>
            </>
          )}

          {tab === 'roles' && (
            <>
              <div className="nc-role-list">
                {server.roles.map((r) => (
                  <div key={r.id} className="nc-role-row">
                    <span className="nc-role-dot" style={{ background: r.color }} />
                    <span className="nc-role-name">{r.name}</span>
                    <span className="nc-role-perms">
                      {r.permissions.admin ? 'Administrator' : r.permissions.manageChannels ? 'Manage Channels' : 'Member'}
                    </span>
                    {server.myPermissions.admin && (
                      <button type="button" className="nc-icon-btn sm" onClick={() => onDeleteRole(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {server.myPermissions.admin && (
                <div className="nc-role-create">
                  <input
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="New role name"
                  />
                  <input type="color" value={roleColor} onChange={(e) => setRoleColor(e.target.value)} />
                  <label className="nc-check-inline">
                    <input type="checkbox" checked={roleAdmin} onChange={(e) => setRoleAdmin(e.target.checked)} />
                    <span>Admin</span>
                  </label>
                  <button
                    type="button"
                    className="nc-btn sm primary"
                    onClick={async () => {
                      if (!roleName.trim()) return;
                      await onCreateRole(roleName.trim(), roleColor, { admin: roleAdmin, manageChannels: true });
                      setRoleName('');
                    }}
                  >
                    <Plus size={14} /> Add Role
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'invites' && (
            <div className="nc-invite-box">
              <div className="nc-field" style={{ marginBottom: 16 }}>
                <span>UNIQUE SERVER ID (FOR DIRECT JOIN)</span>
                <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Give this permanent Server ID to your friends. They can paste it in &ldquo;Join a Server&rdquo; to join immediately:
                </p>
                <div className="nc-invite-code-row">
                  <code>{server.id}</code>
                  <button type="button" className="nc-btn sm primary" onClick={copyServerId}>
                    {copiedId ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId ? 'Copied ID!' : 'Copy Server ID'}</span>
                  </button>
                </div>
              </div>

              <div className="nc-field">
                <span>INVITE CODE</span>
                <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Alternative short invite code for <strong>{server.name}</strong>:
                </p>
                <div className="nc-invite-code-row">
                  <code>{server.inviteCode}</code>
                  <button type="button" className="nc-btn sm secondary" onClick={copyInvite}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied Code!' : 'Copy Code'}</span>
                  </button>
                  {server.myPermissions.manageServer && (
                    <button type="button" className="nc-btn sm secondary" onClick={onRegenInvite}>
                      <RefreshCw size={14} />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ========================================================================= User Settings Modal
interface UserSettingsModalProps {
  me: User;
  onUpdateMe: (patch: Partial<User>) => Promise<void>;
  onLogout: () => void;
  onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  me,
  onUpdateMe,
  onLogout,
  onClose,
}) => {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [status, setStatus] = useState<UserStatus>(me.status);
  const [customStatus, setCustomStatus] = useState(me.customStatus || '');
  const [about, setAbout] = useState(me.about || '');
  const [apiBase, setApiBaseVal] = useState(getApiBase());

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiBase(apiBase);
    await onUpdateMe({ displayName, avatarColor, bannerColor: avatarColor, status, customStatus, about });
    onClose();
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div className="nc-modal-title-ico">
            <Settings size={18} />
            <h3>User Settings</h3>
          </div>
          <button type="button" className="nc-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="nc-modal-body" onSubmit={save}>
          <div className="nc-profile-preview" style={{ borderTopColor: avatarColor }}>
            <Avatar user={{ ...me, displayName, avatarColor, status }} size={54} showStatus />
            <div>
              <strong>{displayName || me.username}</strong>
              <span className="nc-muted">@{me.username}</span>
            </div>
          </div>

          <label className="nc-field">
            <span>DISPLAY NAME</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>

          <div className="nc-grid-2">
            <label className="nc-field">
              <span>ONLINE STATUS</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)}>
                <option value="online">Online</option>
                <option value="idle">Idle</option>
                <option value="dnd">Do Not Disturb</option>
                <option value="invisible">Invisible</option>
              </select>
            </label>
            <label className="nc-field">
              <span>CUSTOM STATUS</span>
              <input value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} placeholder="In Ranked Queue..." />
            </label>
          </div>

          <div className="nc-field">
            <span>AVATAR THEME COLOR</span>
            <div className="nc-color-row">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`nc-color-swatch ${avatarColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setAvatarColor(c)}
                />
              ))}
            </div>
          </div>

          <label className="nc-field">
            <span>ABOUT ME</span>
            <input value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Bio / main agents / roles" />
          </label>

          <label className="nc-field">
            <span>API BACKEND URL (BLANK = SAME ORIGIN)</span>
            <input value={apiBase} onChange={(e) => setApiBaseVal(e.target.value)} placeholder="http://localhost:3001" />
          </label>

          <div className="nc-modal-actions spread">
            <button type="button" className="nc-btn danger" onClick={onLogout}>
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
            <button type="submit" className="nc-btn primary">
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================================================= Quick Switcher (Ctrl+K)
interface QuickSwitcherProps {
  servers: Server[];
  dms: string[];
  users: Record<string, User>;
  onSelectChannel: (serverId: string, channelId: string) => void;
  onSelectDm: (userId: string) => void;
  onClose: () => void;
}

export const QuickSwitcherModal: React.FC<QuickSwitcherProps> = ({
  servers,
  dms,
  users,
  onSelectChannel,
  onSelectDm,
  onClose,
}) => {
  const [q, setQ] = useState('');

  const items = useMemo(() => {
    const res: Array<{ key: string; label: string; sub: string; kind: string; action: () => void }> = [];
    for (const uid of dms) {
      const u = users[uid];
      res.push({
        key: `dm:${uid}`,
        label: `@${u?.displayName || uid}`,
        sub: 'Direct Message',
        kind: 'dm',
        action: () => onSelectDm(uid),
      });
    }
    for (const s of servers) {
      for (const ch of s.channels) {
        res.push({
          key: `${s.id}:${ch.id}`,
          label: `${ch.type === 'voice' ? '🔊 ' : ch.type === 'live' ? '📺 ' : '#'}${ch.name}`,
          sub: s.name,
          kind: ch.type,
          action: () => onSelectChannel(s.id, ch.id),
        });
      }
    }
    const lower = q.trim().toLowerCase();
    return lower ? res.filter((r) => r.label.toLowerCase().includes(lower) || r.sub.toLowerCase().includes(lower)) : res;
  }, [servers, dms, users, q, onSelectChannel, onSelectDm]);

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-switcher" onClick={(e) => e.stopPropagation()}>
        <div className="nc-switcher-input-wrap">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Where would you like to go? (channels, DMs, live stages)"
          />
        </div>
        <div className="nc-switcher-list">
          {items.slice(0, 12).map((it) => (
            <button
              key={it.key}
              type="button"
              className="nc-switcher-item"
              onClick={() => {
                it.action();
                onClose();
              }}
            >
              <span>{it.label}</span>
              <span className="nc-muted">{it.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ========================================================================= User Profile Popover Modal
interface UserProfileModalProps {
  user: User;
  me: User;
  server?: Server | null;
  isFriend: boolean;
  onStartDm: (userId: string) => void;
  onStartCall: (userId: string, video: boolean) => void;
  onAddFriend: (userId: string) => void;
  onToggleRole?: (userId: string, roleId: string) => void;
  onKick?: (userId: string) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  me,
  server,
  isFriend,
  onStartDm,
  onStartCall,
  onAddFriend,
  onToggleRole,
  onKick,
  onOpenSettings,
  onLogout,
  onClose,
}) => {
  const member = server?.members.find((m) => m.userId === user.id);
  const isMe = user.id === me.id;

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-user-card" onClick={(e) => e.stopPropagation()}>
        <div className="nc-user-card-banner" style={{ background: user.bannerColor || user.avatarColor }}>
          <button type="button" className="nc-icon-btn dark" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="nc-user-card-body">
          <div className="nc-user-card-avatar">
            <Avatar user={user} size={74} showStatus />
          </div>
          <h3>{user.displayName}</h3>
          <div className="nc-user-card-handle">
            @{user.username} {user.isBot && <span className="nc-bot-tag">SQUAD BOT</span>}
          </div>
          {user.customStatus && <div className="nc-user-card-status">{user.customStatus}</div>}

          {user.about && (
            <div className="nc-user-card-section">
              <label>ABOUT ME</label>
              <p>{user.about}</p>
            </div>
          )}

          {server && member && (
            <div className="nc-user-card-section">
              <label>ROLES IN {server.name.toUpperCase()}</label>
              <div className="nc-role-pills">
                {server.roles.map((r) => {
                  const has = member.roles.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`nc-role-pill ${has ? 'has' : ''}`}
                      disabled={!server.myPermissions.admin || !onToggleRole}
                      onClick={() => onToggleRole?.(user.id, r.id)}
                    >
                      <span className="nc-role-dot" style={{ background: r.color }} />
                      <span>{r.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isMe ? (
            <div className="nc-user-card-actions">
              {onOpenSettings && (
                <button
                  type="button"
                  className="nc-btn sm primary"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                >
                  <Settings size={14} />
                  <span>Edit Profile & Settings</span>
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  className="nc-btn sm danger"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                >
                  <LogOut size={14} />
                  <span>Log Out</span>
                </button>
              )}
            </div>
          ) : (
            <div className="nc-user-card-actions">
              <button
                type="button"
                className="nc-btn sm primary"
                onClick={() => {
                  onStartDm(user.id);
                  onClose();
                }}
              >
                <MessageSquare size={14} />
                <span>Message</span>
              </button>
              <button
                type="button"
                className="nc-btn sm green"
                onClick={() => {
                  onStartCall(user.id, false);
                  onClose();
                }}
              >
                <Phone size={14} />
                <span>Voice Call</span>
              </button>
              <button
                type="button"
                className="nc-btn sm secondary"
                onClick={() => {
                  onStartCall(user.id, true);
                  onClose();
                }}
              >
                <Video size={14} />
                <span>Video</span>
              </button>
              {!isFriend && (
                <button
                  type="button"
                  className="nc-btn sm secondary"
                  onClick={() => onAddFriend(user.id)}
                >
                  <UserPlus size={14} />
                  <span>Add Friend</span>
                </button>
              )}
              {server?.myPermissions.kick && server.ownerId !== user.id && onKick && (
                <button
                  type="button"
                  className="nc-btn sm danger"
                  onClick={() => {
                    onKick(user.id);
                    onClose();
                  }}
                >
                  <Shield size={14} />
                  <span>Kick</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
