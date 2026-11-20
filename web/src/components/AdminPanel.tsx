import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Key,
  Layers,
  MessageSquare,
  Phone,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  Terminal,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';
import type { User } from '../types';

interface AdminPanelProps {
  currentUser: User;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onClose }) => {
  const [tab, setTab] = useState<'overview' | 'apikeys' | 'logs' | 'users' | 'servers' | 'broadcast'>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);

  // Logs filters
  const [logLevel, setLogLevel] = useState<string>('ALL');
  const [logTag, setLogTag] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(true);

  // Form states for API Keys
  const [f2sKey, setF2sKey] = useState('');
  const [f2sPhoneId, setF2sPhoneId] = useState('');
  const [f2sSenderNumber, setF2sSenderNumber] = useState('');
  const [f2sMessageId, setF2sMessageId] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [nexAppKey, setNexAppKey] = useState('');
  const [nexAppSecret, setNexAppSecret] = useState('');
  const [nexApiHost, setNexApiHost] = useState('');
  const [nexAreaCode, setNexAreaCode] = useState(1);

  const [customTurnUrl, setCustomTurnUrl] = useState('');
  const [customTurnUsername, setCustomTurnUsername] = useState('');
  const [customTurnCredential, setCustomTurnCredential] = useState('');

  // Status feedback
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('Nexcord System Announcement 📢');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  // User search
  const [userQuery, setUserQuery] = useState('');

  // Load initial data
  const refreshData = async () => {
    try {
      const [ovData, cfgData] = await Promise.all([
        api.adminGetOverview(),
        api.adminGetConfig(),
      ]);
      setOverview(ovData);

      // Populate config form inputs
      if (cfgData.fast2sms) {
        setF2sKey(cfgData.fast2sms.apiKey || '');
        setF2sPhoneId(cfgData.fast2sms.phoneId || '');
        setF2sSenderNumber(cfgData.fast2sms.senderNumber || '');
        setF2sMessageId(cfgData.fast2sms.messageId || '');
      }
      if (cfgData.nexconn) {
        setNexAppKey(cfgData.nexconn.appKey || '');
        setNexAppSecret(cfgData.nexconn.appSecret || '');
        setNexApiHost(cfgData.nexconn.apiHost || '');
        setNexAreaCode(cfgData.nexconn.areaCode || 1);
      }
      if (cfgData.webrtc) {
        setCustomTurnUrl(cfgData.webrtc.customTurnUrl || '');
        setCustomTurnUsername(cfgData.webrtc.customTurnUsername || '');
        setCustomTurnCredential(cfgData.webrtc.customTurnCredential || '');
      }
    } catch (e: any) {
      setFeedback({ text: `Failed to load admin data: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const res = await api.adminGetLogs({
        level: logLevel,
        tag: logTag,
        search: logSearch,
        limit: 200,
      });
      setLogs(res.logs || []);
    } catch (e: any) {
      console.warn('Logs error:', e.message);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.adminGetUsers();
      setUsers(res.users || []);
    } catch (e: any) {
      setFeedback({ text: `Failed to load users: ${e.message}`, type: 'error' });
    }
  };

  const loadServers = async () => {
    try {
      const res = await api.adminGetServers();
      setServers(res.servers || []);
    } catch (e: any) {
      setFeedback({ text: `Failed to load servers: ${e.message}`, type: 'error' });
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
    if (tab === 'users') loadUsers();
    if (tab === 'servers') loadServers();
  }, [tab, logLevel, logTag, logSearch]);

  // Periodic auto-refresh for logs
  useEffect(() => {
    if (tab !== 'logs' || !autoRefreshLogs) return;
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [tab, autoRefreshLogs, logLevel, logTag, logSearch]);

  // Save Fast2SMS API Key & Settings
  const handleSaveFast2Sms = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingKey(true);
    setFeedback(null);
    try {
      const res = await api.adminSaveConfig({
        fast2sms: {
          apiKey: f2sKey.trim(),
          phoneId: f2sPhoneId.trim(),
          senderNumber: f2sSenderNumber.trim(),
          messageId: f2sMessageId.trim(),
        },
      });
      setFeedback({
        text: `✓ Fast2SMS Configuration Saved! Verified: ${res.fast2smsVerified ? 'YES' : 'NO'} (${res.walletBalance || 'OK'})`,
        type: res.fast2smsVerified ? 'success' : 'info',
      });
      refreshData();
    } catch (e: any) {
      setFeedback({ text: `Failed to save Fast2SMS config: ${e.message}`, type: 'error' });
    } finally {
      setSavingKey(false);
    }
  };

  // Test Fast2SMS API Key
  const handleTestFast2Sms = async () => {
    setTestingKey(true);
    setFeedback(null);
    try {
      const res = await api.adminTestApi('fast2sms', f2sKey.trim());
      if (res.connected) {
        setFeedback({
          text: `✓ Fast2SMS API Key is working! Balance: ${res.balance} • ${res.smsCount} messages available`,
          type: 'success',
        });
      } else {
        setFeedback({
          text: `✗ Fast2SMS API Key Failed: ${res.error || 'Connection rejected'}`,
          type: 'error',
        });
      }
      refreshData();
    } catch (e: any) {
      setFeedback({ text: `API test error: ${e.message}`, type: 'error' });
    } finally {
      setTestingKey(false);
    }
  };

  // Save Nexconn Credentials
  const handleSaveNexconn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingKey(true);
    setFeedback(null);
    try {
      await api.adminSaveConfig({
        nexconn: {
          appKey: nexAppKey.trim(),
          appSecret: nexAppSecret.trim(),
          apiHost: nexApiHost.trim(),
          areaCode: Number(nexAreaCode) || 1,
        },
      });
      setFeedback({ text: '✓ Nexconn SDK Credentials updated and re-initialized!', type: 'success' });
      refreshData();
    } catch (e: any) {
      setFeedback({ text: `Failed to save Nexconn credentials: ${e.message}`, type: 'error' });
    } finally {
      setSavingKey(false);
    }
  };

  // Save WebRTC Settings
  const handleSaveWebRtc = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingKey(true);
    setFeedback(null);
    try {
      await api.adminSaveConfig({
        webrtc: {
          customTurnUrl: customTurnUrl.trim(),
          customTurnUsername: customTurnUsername.trim(),
          customTurnCredential: customTurnCredential.trim(),
        },
      });
      setFeedback({ text: '✓ WebRTC ICE/TURN configuration saved!', type: 'success' });
      refreshData();
    } catch (e: any) {
      setFeedback({ text: `Failed to save WebRTC config: ${e.message}`, type: 'error' });
    } finally {
      setSavingKey(false);
    }
  };

  // Send System Broadcast
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setBroadcasting(true);
    setFeedback(null);
    try {
      const res = await api.adminBroadcast(broadcastTitle.trim(), broadcastMessage.trim());
      setFeedback({ text: `✓ ${res.message} (${res.recipients} active sockets reached)`, type: 'success' });
      setBroadcastMessage('');
    } catch (e: any) {
      setFeedback({ text: `Broadcast failed: ${e.message}`, type: 'error' });
    } finally {
      setBroadcasting(false);
    }
  };

  // User Admin Toggle
  const handleToggleAdmin = async (uid: string) => {
    try {
      await api.adminToggleUserAdmin(uid);
      loadUsers();
    } catch (e: any) {
      setFeedback({ text: `Action failed: ${e.message}`, type: 'error' });
    }
  };

  // Delete User
  const handleDeleteUser = async (uid: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${name}"?`)) return;
    try {
      await api.adminDeleteUser(uid);
      loadUsers();
    } catch (e: any) {
      setFeedback({ text: `Failed to delete user: ${e.message}`, type: 'error' });
    }
  };

  // Delete Server
  const handleDeleteServer = async (sid: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete server "${name}"?`)) return;
    try {
      await api.adminDeleteServer(sid);
      loadServers();
    } catch (e: any) {
      setFeedback({ text: `Failed to delete server: ${e.message}`, type: 'error' });
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!userQuery.trim()) return true;
    const q = userQuery.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q))
    );
  });

  return (
    <div className="nc-admin-overlay">
      <div className="nc-admin-modal">
        {/* Top Header */}
        <div className="nc-admin-header">
          <div className="nc-admin-header-title">
            <div className="nc-admin-badge-icon">
              <Shield size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff', letterSpacing: -0.3 }}>
                  Nexcord Admin Console
                </h1>
                <span className="nc-badge-pill green">
                  <span className="nc-live-dot" /> LIVE TELEMETRY
                </span>
                {loading && (
                  <span style={{ fontSize: 11, color: '#949ba4', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={11} className="nc-spin" /> Syncing...
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                Authenticated as Administrator ({currentUser.displayName}) • Full System & API Access
              </p>
            </div>
          </div>
          <button className="nc-icon-btn close" onClick={onClose} title="Close Admin Console">
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="nc-admin-tabs">
          <button
            className={`nc-admin-tab ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            <Activity size={15} />
            <span>Health & Telemetry</span>
          </button>
          <button
            className={`nc-admin-tab ${tab === 'apikeys' ? 'active' : ''}`}
            onClick={() => setTab('apikeys')}
          >
            <Key size={15} />
            <span>API Keys & Config</span>
          </button>
          <button
            className={`nc-admin-tab ${tab === 'logs' ? 'active' : ''}`}
            onClick={() => setTab('logs')}
          >
            <Terminal size={15} />
            <span>Live System Logs</span>
          </button>
          <button
            className={`nc-admin-tab ${tab === 'users' ? 'active' : ''}`}
            onClick={() => setTab('users')}
          >
            <Users size={15} />
            <span>Users & Members</span>
          </button>
          <button
            className={`nc-admin-tab ${tab === 'servers' ? 'active' : ''}`}
            onClick={() => setTab('servers')}
          >
            <Server size={15} />
            <span>Servers & Channels</span>
          </button>
          <button
            className={`nc-admin-tab ${tab === 'broadcast' ? 'active' : ''}`}
            onClick={() => setTab('broadcast')}
          >
            <Radio size={15} />
            <span>System Broadcast</span>
          </button>
        </div>

        {/* Global Alert / Feedback */}
        {feedback && (
          <div className={`nc-admin-alert ${feedback.type}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.text}</span>
            <button className="nc-link-btn" onClick={() => setFeedback(null)} style={{ marginLeft: 'auto', color: 'inherit' }}>
              Dismiss
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="nc-admin-body">
          {/* TAB 1: OVERVIEW */}
          {tab === 'overview' && (
            <div className="nc-admin-section">
              <div className="nc-admin-grid">
                {/* Fast2SMS WhatsApp Telemetry */}
                <div className="nc-admin-card highlight">
                  <div className="nc-admin-card-header">
                    <div className="nc-card-icon whatsapp">
                      <Phone size={18} />
                    </div>
                    <div>
                      <h3 className="nc-card-title">Fast2SMS WhatsApp Cloud API</h3>
                      <p className="nc-card-sub">OTP Delivery Engine (₹0.25 / SMS)</p>
                    </div>
                    <span className={`nc-status-badge ${overview?.integrations?.fast2sms?.connected ? 'online' : 'warn'}`}>
                      {overview?.integrations?.fast2sms?.connected ? 'Connected' : 'Action Needed'}
                    </span>
                  </div>
                  <div className="nc-admin-card-metrics">
                    <div className="nc-metric-row">
                      <span>Wallet Balance:</span>
                      <strong style={{ color: '#57f287', fontSize: 16 }}>
                        {overview?.integrations?.fast2sms?.balance || '₹101.00'}
                      </strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Message Quota:</span>
                      <strong>{overview?.integrations?.fast2sms?.smsCount || 404} messages</strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Phone ID:</span>
                      <code>{overview?.integrations?.fast2sms?.phoneId || '1454063874454915'}</code>
                    </div>
                    <div className="nc-metric-row">
                      <span>Sender Number:</span>
                      <strong>+91 72518 80344</strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Templates Status:</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {overview?.integrations?.fast2sms?.templates?.length > 0 ? (
                          overview.integrations.fast2sms.templates.map((t: any) => (
                            <span key={t.messageId} className={`nc-badge-pill ${t.status?.toLowerCase() === 'approved' ? 'green' : 'amber'}`}>
                              {t.name} ({t.status})
                            </span>
                          ))
                        ) : (
                          <span className="nc-badge-pill amber">nexcord_status_update (In Review)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="nc-admin-card-actions">
                    <button className="nc-btn secondary small" onClick={handleTestFast2Sms} disabled={testingKey}>
                      <RefreshCw size={13} className={testingKey ? 'spin' : ''} />
                      <span>{testingKey ? 'Checking...' : 'Check Balance & Status'}</span>
                    </button>
                    <button className="nc-btn primary small" onClick={() => setTab('apikeys')}>
                      <Key size={13} />
                      <span>Change API Key</span>
                    </button>
                  </div>
                </div>

                {/* Nexconn SDK Telemetry */}
                <div className="nc-admin-card">
                  <div className="nc-admin-card-header">
                    <div className="nc-card-icon nexconn">
                      <Zap size={18} />
                    </div>
                    <div>
                      <h3 className="nc-card-title">Nexconn Chat SDK</h3>
                      <p className="nc-card-sub">AI & Messaging Platform</p>
                    </div>
                    <span className="nc-status-badge online">
                      {overview?.integrations?.nexconn?.configured ? 'Active' : 'Demo Mode'}
                    </span>
                  </div>
                  <div className="nc-admin-card-metrics">
                    <div className="nc-metric-row">
                      <span>AppKey:</span>
                      <code>{overview?.integrations?.nexconn?.appKey || 'Configured'}</code>
                    </div>
                    <div className="nc-metric-row">
                      <span>API Host:</span>
                      <code>{overview?.integrations?.nexconn?.apiHost || 'Default'}</code>
                    </div>
                    <div className="nc-metric-row">
                      <span>Area Code:</span>
                      <strong>{overview?.integrations?.nexconn?.areaCode || 1} (Global)</strong>
                    </div>
                  </div>
                  <div className="nc-admin-card-actions">
                    <button className="nc-btn secondary small" onClick={() => setTab('apikeys')}>
                      <Key size={13} />
                      <span>Edit Credentials</span>
                    </button>
                  </div>
                </div>

                {/* WebRTC Audio/Video Relays */}
                <div className="nc-admin-card">
                  <div className="nc-admin-card-header">
                    <div className="nc-card-icon webrtc">
                      <Wifi size={18} />
                    </div>
                    <div>
                      <h3 className="nc-card-title">WebRTC Turn & STUN Relays</h3>
                      <p className="nc-card-sub">NAT Traversal & Voice Mesh</p>
                    </div>
                    <span className="nc-status-badge online">Operational</span>
                  </div>
                  <div className="nc-admin-card-metrics">
                    <div className="nc-metric-row">
                      <span>TURN Server:</span>
                      <code>turn:openrelay.metered.ca:80/443</code>
                    </div>
                    <div className="nc-metric-row">
                      <span>Multi-Region STUN:</span>
                      <strong>Google, Cloudflare, Twilio</strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Active Voice Participants:</span>
                      <strong style={{ color: '#57f287' }}>{overview?.database?.activeVoiceCount || 0} users in call</strong>
                    </div>
                  </div>
                </div>

                {/* Cloud Backend Server Metrics */}
                <div className="nc-admin-card">
                  <div className="nc-admin-card-header">
                    <div className="nc-card-icon server">
                      <Cpu size={18} />
                    </div>
                    <div>
                      <h3 className="nc-card-title">Backend Server Engine</h3>
                      <p className="nc-card-sub">Render Cloud Instance</p>
                    </div>
                    <span className="nc-status-badge online">Healthy</span>
                  </div>
                  <div className="nc-admin-card-metrics">
                    <div className="nc-metric-row">
                      <span>Server Uptime:</span>
                      <strong>{overview?.system?.uptimeFormatted || 'Active'}</strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Memory RSS:</span>
                      <strong>{overview?.system?.memory?.rssMb || 45} MB</strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Live WebSocket/SSE Streams:</span>
                      <strong style={{ color: '#5865f2' }}>{overview?.system?.activeConnections || 1} online</strong>
                    </div>
                    <div className="nc-metric-row">
                      <span>Node Runtime:</span>
                      <code>{overview?.system?.nodeVersion || 'v20.x'} ({overview?.system?.platform})</code>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database Totals Bar */}
              <div className="nc-admin-stats-bar">
                <div className="nc-stat-box">
                  <Users size={16} />
                  <div>
                    <strong>{overview?.database?.usersCount || 0}</strong>
                    <span>Total Users</span>
                  </div>
                </div>
                <div className="nc-stat-box">
                  <Server size={16} />
                  <div>
                    <strong>{overview?.database?.serversCount || 0}</strong>
                    <span>Total Servers</span>
                  </div>
                </div>
                <div className="nc-stat-box">
                  <Layers size={16} />
                  <div>
                    <strong>{overview?.database?.channelsCount || 0}</strong>
                    <span>Total Channels</span>
                  </div>
                </div>
                <div className="nc-stat-box">
                  <MessageSquare size={16} />
                  <div>
                    <strong>{overview?.database?.messagesCount || 0}</strong>
                    <span>Messages Sent</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: API KEYS & CONFIG */}
          {tab === 'apikeys' && (
            <div className="nc-admin-section">
              <div className="nc-admin-form-container">
                {/* Fast2SMS Settings */}
                <form onSubmit={handleSaveFast2Sms} className="nc-admin-form-card">
                  <div className="nc-form-header">
                    <Phone size={18} color="#57f287" />
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Fast2SMS WhatsApp Cloud API Key</h3>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                        Manage the Fast2SMS API key used to deliver WhatsApp OTPs and transactional notifications.
                      </p>
                    </div>
                  </div>

                  <div className="nc-field">
                    <label>FAST2SMS AUTHORIZATION API KEY</label>
                    <div className="nc-input-password-wrap">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={f2sKey}
                        onChange={(e) => setF2sKey(e.target.value)}
                        placeholder="Enter 80+ character Fast2SMS key"
                        required
                      />
                      <button
                        type="button"
                        className="nc-icon-btn inline"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <span className="nc-field-hint">
                      Get your key from fast2sms.com &gt; Dev API &gt; Authorization Key.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="nc-field">
                      <label>WABA PHONE NUMBER ID</label>
                      <input
                        value={f2sPhoneId}
                        onChange={(e) => setF2sPhoneId(e.target.value)}
                        placeholder="e.g. 1454063874454915"
                      />
                    </div>
                    <div className="nc-field">
                      <label>SENDER NUMBER</label>
                      <input
                        value={f2sSenderNumber}
                        onChange={(e) => setF2sSenderNumber(e.target.value)}
                        placeholder="+917251880344"
                      />
                    </div>
                  </div>

                  <div className="nc-field">
                    <label>APPROVED TEMPLATE MESSAGE ID (OPTIONAL PIN)</label>
                    <input
                      value={f2sMessageId}
                      onChange={(e) => setF2sMessageId(e.target.value)}
                      placeholder="e.g. 46101 (leave empty to auto-detect approved template)"
                    />
                    <span className="nc-field-hint">
                      If empty, Nexcord automatically searches your account for approved templates (e.g. 46101 or 46083).
                    </span>
                  </div>

                  <div className="nc-form-actions">
                    <button type="button" className="nc-btn secondary" onClick={handleTestFast2Sms} disabled={testingKey}>
                      <RefreshCw size={14} className={testingKey ? 'spin' : ''} />
                      <span>{testingKey ? 'Testing Key...' : 'Test Key & Balance'}</span>
                    </button>
                    <button type="submit" className="nc-btn green" disabled={savingKey}>
                      <CheckCircle2 size={14} />
                      <span>{savingKey ? 'Saving...' : 'Save & Apply Fast2SMS Key'}</span>
                    </button>
                  </div>
                </form>

                {/* Nexconn SDK Settings */}
                <form onSubmit={handleSaveNexconn} className="nc-admin-form-card">
                  <div className="nc-form-header">
                    <Zap size={18} color="#5865f2" />
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Nexconn Chat SDK Credentials</h3>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                        Configure Nexconn platform AppKey and secret for token issuance and direct SDK synchronization.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="nc-field">
                      <label>NEXCONN APP KEY</label>
                      <input
                        value={nexAppKey}
                        onChange={(e) => setNexAppKey(e.target.value)}
                        placeholder="e.g. cpj2x02hcw8eh"
                      />
                    </div>
                    <div className="nc-field">
                      <label>NEXCONN APP SECRET</label>
                      <input
                        type="password"
                        value={nexAppSecret}
                        onChange={(e) => setNexAppSecret(e.target.value)}
                        placeholder="Enter secret"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div className="nc-field">
                      <label>API HOST</label>
                      <input
                        value={nexApiHost}
                        onChange={(e) => setNexApiHost(e.target.value)}
                        placeholder="e.g. https://api-us.ronghub.com"
                      />
                    </div>
                    <div className="nc-field">
                      <label>AREA CODE</label>
                      <input
                        type="number"
                        value={nexAreaCode}
                        onChange={(e) => setNexAreaCode(Number(e.target.value))}
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div className="nc-form-actions">
                    <button type="submit" className="nc-btn primary" disabled={savingKey}>
                      <CheckCircle2 size={14} />
                      <span>Save Nexconn Credentials</span>
                    </button>
                  </div>
                </form>

                {/* Custom WebRTC TURN Settings */}
                <form onSubmit={handleSaveWebRtc} className="nc-admin-form-card">
                  <div className="nc-form-header">
                    <Wifi size={18} color="#00e5ff" />
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Custom WebRTC TURN Relays</h3>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                        Add an optional custom TURN relay to supplement the default Metered OpenRelay configuration.
                      </p>
                    </div>
                  </div>

                  <div className="nc-field">
                    <label>CUSTOM TURN SERVER URL</label>
                    <input
                      value={customTurnUrl}
                      onChange={(e) => setCustomTurnUrl(e.target.value)}
                      placeholder="e.g. turn:my-relay.example.com:3478"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="nc-field">
                      <label>TURN USERNAME</label>
                      <input
                        value={customTurnUsername}
                        onChange={(e) => setCustomTurnUsername(e.target.value)}
                        placeholder="Username"
                      />
                    </div>
                    <div className="nc-field">
                      <label>TURN CREDENTIAL / PASSWORD</label>
                      <input
                        type="password"
                        value={customTurnCredential}
                        onChange={(e) => setCustomTurnCredential(e.target.value)}
                        placeholder="Credential"
                      />
                    </div>
                  </div>

                  <div className="nc-form-actions">
                    <button type="submit" className="nc-btn secondary" disabled={savingKey}>
                      <CheckCircle2 size={14} />
                      <span>Save Custom TURN Settings</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE LOGS */}
          {tab === 'logs' && (
            <div className="nc-admin-section">
              {/* Filter controls */}
              <div className="nc-logs-toolbar">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="nc-select"
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                  >
                    <option value="ALL">All Levels</option>
                    <option value="INFO">Info</option>
                    <option value="SUCCESS">Success</option>
                    <option value="WARN">Warnings</option>
                    <option value="ERROR">Errors</option>
                  </select>

                  <select
                    className="nc-select"
                    value={logTag}
                    onChange={(e) => setLogTag(e.target.value)}
                  >
                    <option value="ALL">All Tags</option>
                    <option value="AUTH">AUTH</option>
                    <option value="FAST2SMS">FAST2SMS</option>
                    <option value="NEXCONN">NEXCONN</option>
                    <option value="WEBRTC">WEBRTC</option>
                    <option value="SYSTEM">SYSTEM</option>
                    <option value="API">API</option>
                  </select>

                  <div className="nc-search-box">
                    <Search size={14} />
                    <input
                      placeholder="Search log messages..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="nc-checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoRefreshLogs}
                      onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                    />
                    <span>Auto-stream</span>
                  </label>
                  <button className="nc-btn secondary small" onClick={loadLogs}>
                    <RefreshCw size={13} />
                    <span>Refresh</span>
                  </button>
                  <button
                    className="nc-btn danger small"
                    onClick={async () => {
                      if (window.confirm('Clear the in-memory logs buffer?')) {
                        await api.adminClearLogs();
                        loadLogs();
                      }
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* Logs Stream Table */}
              <div className="nc-logs-terminal">
                {logs.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No system logs matching the current filter.
                  </div>
                ) : (
                  <div className="nc-logs-list">
                    {logs.map((l) => {
                      const timeStr = new Date(l.timestamp).toLocaleTimeString();
                      return (
                        <div key={l.id} className={`nc-log-entry ${l.level}`}>
                          <span className="nc-log-time">{timeStr}</span>
                          <span className={`nc-log-level ${l.level}`}>{l.level.toUpperCase()}</span>
                          <span className="nc-log-tag">[{l.tag}]</span>
                          <span className="nc-log-msg">{l.message}</span>
                          {l.details && (
                            <pre className="nc-log-details">{l.details}</pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: USERS MANAGEMENT */}
          {tab === 'users' && (
            <div className="nc-admin-section">
              <div className="nc-table-toolbar">
                <div className="nc-search-box">
                  <Search size={14} />
                  <input
                    placeholder="Search users by name, username, or phone..."
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                  />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Total registered users: {users.length}
                </span>
              </div>

              <div className="nc-admin-table-wrap">
                <table className="nc-admin-table">
                  <thead>
                    <tr>
                      <th>USER</th>
                      <th>PHONE</th>
                      <th>STATUS</th>
                      <th>ADMIN?</th>
                      <th>SERVERS</th>
                      <th>REGISTERED</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              className="nc-table-avatar"
                              style={{ background: u.avatarColor || '#5865F2' }}
                            >
                              {(u.displayName || 'U')[0].toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ color: '#fff' }}>{u.displayName}</strong>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code>{u.phone}</code>
                        </td>
                        <td>
                          <span className={`nc-status-dot ${u.status === 'online' ? 'online' : 'offline'}`} />
                          <span style={{ fontSize: 12, marginLeft: 6 }}>{u.status}</span>
                        </td>
                        <td>
                          {u.isAdmin ? (
                            <span className="nc-badge-pill green">Admin 🛡️</span>
                          ) : (
                            <span className="nc-badge-pill gray">User</span>
                          )}
                        </td>
                        <td>{u.serverCount || 0}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="nc-btn secondary small"
                              title={u.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                              onClick={() => handleToggleAdmin(u.id)}
                            >
                              {u.isAdmin ? <UserMinus size={13} /> : <UserCheck size={13} />}
                              <span>{u.isAdmin ? 'Demote' : 'Promote'}</span>
                            </button>
                            {u.id !== currentUser.id && (
                              <button
                                className="nc-btn danger small"
                                title="Delete user"
                                onClick={() => handleDeleteUser(u.id, u.displayName)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: SERVERS MANAGEMENT */}
          {tab === 'servers' && (
            <div className="nc-admin-section">
              <div className="nc-admin-table-wrap">
                <table className="nc-admin-table">
                  <thead>
                    <tr>
                      <th>SERVER NAME</th>
                      <th>SERVER ID</th>
                      <th>INVITE CODE</th>
                      <th>OWNER</th>
                      <th>MEMBERS</th>
                      <th>CHANNELS</th>
                      <th>CREATED</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              className="nc-table-avatar"
                              style={{ background: s.iconColor || '#5865F2', borderRadius: 8 }}
                            >
                              {(s.name || 'S')[0].toUpperCase()}
                            </div>
                            <strong style={{ color: '#fff' }}>{s.name}</strong>
                          </div>
                        </td>
                        <td>
                          <code>{s.id}</code>
                        </td>
                        <td>
                          <span className="nc-badge-pill green">{s.inviteCode}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>{s.ownerName}</td>
                        <td>{s.memberCount}</td>
                        <td>{s.channelCount}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(s.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <button
                            className="nc-btn danger small"
                            onClick={() => handleDeleteServer(s.id, s.name)}
                          >
                            <Trash2 size={13} />
                            <span>Purge</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: BROADCAST */}
          {tab === 'broadcast' && (
            <div className="nc-admin-section">
              <form onSubmit={handleBroadcast} className="nc-admin-form-card" style={{ maxWidth: 640 }}>
                <div className="nc-form-header">
                  <Radio size={20} color="#eb459e" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Live System Broadcast</h3>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      Transmit an instant push announcement to every connected user across all web and mobile apps.
                    </p>
                  </div>
                </div>

                <div className="nc-field">
                  <label>ANNOUNCEMENT TITLE</label>
                  <input
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="e.g. Server Maintenance Notice"
                    required
                  />
                </div>

                <div className="nc-field">
                  <label>BROADCAST MESSAGE BODY</label>
                  <textarea
                    rows={4}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Type your message here. All active users will receive an instant banner."
                    required
                  />
                </div>

                <div className="nc-form-actions">
                  <button type="submit" className="nc-btn primary" disabled={broadcasting}>
                    <Radio size={15} />
                    <span>{broadcasting ? 'Transmitting...' : 'Send Broadcast to All Users 📢'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
