import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  Check,
  Compass,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  Gamepad2,
  Hash,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  MessageSquare,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Upload,
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
import { api, getApiBase, getApkDownloadUrl, setApiBase } from '../services/api';
import { Avatar } from './Avatar';
import { sendFirebasePhoneOtp, verifyFirebasePhoneOtp } from '../services/firebaseAuth';

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#F47B67', '#3BA55C', '#FAA61A', '#9B84EE', '#1ABC9C'];

// ========================================================================= Auth Screen
interface AuthScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, displayName: string) => Promise<void>;
  onDemoLogin: (displayName?: string) => Promise<void>;
  onVerifyOtp: (phone: string, otp: string, displayName?: string) => Promise<void>;
  onFirebaseLogin?: (phone: string, idToken: string, displayName?: string) => Promise<void>;
}

const POPULAR_COUNTRY_CODES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'USA / Canada', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+7', name: 'Russia / KZ', flag: '🇷🇺' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onRegister, onDemoLogin, onVerifyOtp, onFirebaseLogin }) => {
  const [authMethod, setAuthMethod] = useState<'mobile' | 'password'>('mobile');
  const [mobileStep, setMobileStep] = useState<'phone' | 'otp'>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneDigits, setPhoneDigits] = useState('');
  const otpChannel = 'sms';
  const [usedFirebase, setUsedFirebase] = useState(false);
  const [devOtpPreview, setDevOtpPreview] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const formatCooldown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Password fallback mode states
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    const isAdmin = cleanDigits === '123456789';
    if (!isAdmin) {
      if (countryCode.trim() === '+91') {
        if (!/^[6-9]\d{9}$/.test(cleanDigits) || /^(\d)\1{9}$/.test(cleanDigits)) {
          setErr('The mobile number entered is incorrect. Please check your 10-digit number and try again later.');
          return;
        }
      } else {
        if (cleanDigits.length < 7 || cleanDigits.length > 15) {
          setErr('The mobile number entered is incorrect. Please check the international number (7-15 digits) and try again later.');
          return;
        }
      }
    }
    setBusy(true);

    if (isAdmin) {
      try {
        if (serverUrl.trim()) setApiBase(serverUrl.trim());
        const res = await api.sendOtp(fullPhone, otpChannel);
        setUsedFirebase(false);
        setMobileStep('otp');
        setCooldown(res.cooldownSeconds ?? 30);
        if (res.devOtp) setDevOtpPreview(res.devOtp);
      } catch (err: any) {
        setErr(err?.message || 'Admin login initialization failed');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Google Firebase Phone Auth first, with automatic Server SMS fallback
    try {
      await sendFirebasePhoneOtp(fullPhone, 'nc-recaptcha-container');
      setUsedFirebase(true);
      setMobileStep('otp');
      setCooldown(30);
    } catch (fbErr: any) {
      console.warn('[Firebase Auth] Notice, falling back to Carrier SMS Gateway:', fbErr?.message);
      try {
        if (serverUrl.trim()) setApiBase(serverUrl.trim());
        const res = await api.sendOtp(fullPhone, otpChannel);
        setUsedFirebase(false);
        setMobileStep('otp');
        const cd = res.cooldownSeconds ?? 30;
        setCooldown(cd);
        if (res.devOtp) {
          setDevOtpPreview(res.devOtp);
        }
      } catch (e: any) {
        setErr(e?.message || fbErr?.message || 'Failed to send verification SMS');
        if (e?.cooldownSeconds && e.cooldownSeconds > 0) {
          setCooldown(e.cooldownSeconds);
        }
      }
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
      if (usedFirebase && onFirebaseLogin) {
        try {
          const { idToken } = await verifyFirebasePhoneOtp(cleanOtp);
          await onFirebaseLogin(fullPhone, idToken, displayName.trim() || undefined);
          return;
        } catch (fbErr: any) {
          console.warn('[Firebase] Verification fallback to server:', fbErr);
          await onVerifyOtp(fullPhone, cleanOtp, displayName.trim() || undefined);
        }
      } else {
        await onVerifyOtp(fullPhone, cleanOtp, displayName.trim() || undefined);
      }
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
      <div className="nc-auth-orb orb-1" aria-hidden="true" />
      <div className="nc-auth-orb orb-2" aria-hidden="true" />

      <div className="nc-auth-shell">
        {/* Left Hero Showcase (Desktop) */}
        <div className="nc-auth-hero">
          <div className="nc-auth-hero-pill">
            <Sparkles size={13} />
            <span>NEXCONN REAL-TIME ENGINE • SUB-200MS</span>
          </div>
          <h2 className="nc-auth-hero-title">
            Your Squad&apos;s Tactical <span>Command Center.</span>
          </h2>
          <p className="nc-auth-hero-desc">
            Unite low-latency voice huddles, live 60 FPS esports broadcasts with Danmaku chat, and instant in-match radial callouts in one cohesive hub.
          </p>

          <div className="nc-auth-features-grid">
            <div className="nc-auth-feat-card">
              <div className="nc-auth-feat-ico purple"><Zap size={18} /></div>
              <div>
                <strong>Sub-200ms Quick Chat</strong>
                <span>Radial callouts &amp; Alt+1..5 hotkeys</span>
              </div>
            </div>
            <div className="nc-auth-feat-card">
              <div className="nc-auth-feat-ico red"><Tv size={18} /></div>
              <div>
                <strong>60 FPS Esports Stage</strong>
                <span>Bullet Danmaku &amp; live hype bursts</span>
              </div>
            </div>
            <div className="nc-auth-feat-card">
              <div className="nc-auth-feat-ico green"><Radio size={18} /></div>
              <div>
                <strong>1-Click Voice Huddles</strong>
                <span>WebRTC + Call SDK game audio boost</span>
              </div>
            </div>
            <div className="nc-auth-feat-card">
              <div className="nc-auth-feat-ico yellow"><Compass size={18} /></div>
              <div>
                <strong>Tactical Radar Pings</strong>
                <span>Real-time map callouts for 4v4/5v5</span>
              </div>
            </div>
          </div>

          {/* Desktop APK Banner */}
          <div className="nc-apk-banner desktop-apk">
            <div className="nc-apk-left">
              <div className="nc-apk-icon">
                <Smartphone size={20} />
              </div>
              <div>
                <div className="nc-apk-title">Nexcord for Android (v1.1)</div>
                <div className="nc-apk-sub">Latest Material 3 UI &amp; UX • Direct APK</div>
              </div>
            </div>
            <a
              href={getApkDownloadUrl()}
              download="Nexcord-Flutter.apk"
              className="nc-btn primary sm nc-apk-btn"
            >
              <Download size={14} />
              <span>Download APK</span>
            </a>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="nc-auth-card">
          <div className="nc-auth-brand">
            <div className="nc-auth-logo">
              <Gamepad2 size={26} />
            </div>
            <div>
              <h1>Nexcord</h1>
              <p>Gaming, Squad Chat &amp; Live Streams</p>
            </div>
          </div>

          {/* Instant 1-Click Guest Entry Strip */}
          <div className="nc-instant-guest-strip">
            <div className="nc-instant-guest-head">
              <span className="nc-instant-badge"><Zap size={13} /> INSTANT GUEST ACCESS</span>
              <span className="nc-instant-sub">No signup needed</span>
            </div>
            <div className="nc-demo-row">
              <input
                value={demoHandle}
                onChange={(e) => setDemoHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDemo();
                  }
                }}
                placeholder="Gamer tag (optional, e.g. Striker)"
              />
              <button type="button" className="nc-btn green" disabled={busy} onClick={handleDemo}>
                <Zap size={15} />
                <span>Enter Arena</span>
              </button>
            </div>
          </div>

          <div className="nc-divider">
            <span>OR SIGN IN WITH ACCOUNT</span>
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
              <span>Mobile OTP</span>
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
              <span>Username &amp; Password</span>
            </button>
          </div>

          {authMethod === 'mobile' ? (
            <div>
              {mobileStep === 'phone' ? (
                <form onSubmit={handleSendOtp} className="nc-auth-form">
                  <label className="nc-field">
                    <span>COUNTRY &amp; REGION</span>
                    <select
                      className="nc-phone-country-select"
                      value={POPULAR_COUNTRY_CODES.some((c) => c.code === countryCode) ? countryCode : 'custom'}
                      onChange={(e) => {
                        if (e.target.value !== 'custom') {
                          setCountryCode(e.target.value);
                        }
                      }}
                    >
                      {POPULAR_COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} ({c.code})
                        </option>
                      ))}
                      <option value="custom">🌍 Custom Dial Code</option>
                    </select>
                  </label>

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
                        placeholder="98765 43210"
                        required
                        autoFocus
                      />
                    </div>
                  </label>

                  {phoneDigits.replace(/\D/g, '') === '123456789' && (
                    <div className="nc-admin-hint-banner">
                      <Shield size={16} color="#FEE75C" />
                      <span><strong>Admin Master Account 🛡️:</strong> Verify with OTP <code>123456</code>.</span>
                    </div>
                  )}

                  <label className="nc-field">
                    <span>GAMER TAG / DISPLAY NAME (OPTIONAL)</span>
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

                  <button type="submit" className="nc-btn primary full nc-btn-glow" disabled={busy}>
                    <Phone size={15} />
                    <span>{busy ? 'Sending Verification SMS...' : 'Send 6-Digit OTP Code'}</span>
                  </button>
                  <div id="nc-recaptcha-container"></div>
                </form>
              ) : (
                <form onSubmit={handleVerify} className="nc-auth-form">
                  <div className="nc-otp-step-head">
                    <div>
                      <h2>Verify Mobile Code</h2>
                      <p>Sent via SMS to <strong>{fullPhone}</strong></p>
                    </div>
                    <button
                      type="button"
                      className="nc-link-btn"
                      onClick={() => {
                        setErr('');
                        setMobileStep('phone');
                      }}
                    >
                      Change
                    </button>
                  </div>

                  <label className="nc-field">
                    <span>ENTER 6-DIGIT CODE</span>
                    <div className="nc-otp-slots-wrap">
                      <input
                        className="nc-otp-hidden-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoFocus
                        required
                      />
                      <div className="nc-otp-slots" aria-hidden="true">
                        {[0, 1, 2, 3, 4, 5].map((idx) => {
                          const char = otp[idx] || '';
                          const isCurrent = otp.length === idx || (otp.length === 6 && idx === 5);
                          return (
                            <div key={idx} className={`nc-otp-slot ${char ? 'filled' : ''} ${isCurrent ? 'active' : ''}`}>
                              {char || '•'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </label>

                  {devOtpPreview && (
                    <div className="nc-dev-otp-banner">
                      <span>🔑 Code: <strong>{devOtpPreview}</strong></span>
                      <button
                        type="button"
                        className="nc-btn xs green"
                        onClick={() => setOtp(devOtpPreview)}
                      >
                        Auto-fill
                      </button>
                    </div>
                  )}

                  {(phoneDigits.replace(/\D/g, '') === '123456789' || fullPhone.includes('123456789')) && (
                    <div className="nc-dev-otp-banner warn">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={15} /> Admin Code: <strong>123456</strong>
                      </span>
                      <button
                        type="button"
                        className="nc-btn xs secondary"
                        onClick={() => setOtp('123456')}
                      >
                        Auto-fill 123456
                      </button>
                    </div>
                  )}

                  {err && <div className="nc-error-banner">{err}</div>}

                  <button type="submit" className="nc-btn green full" disabled={busy || otp.length < 4}>
                    <Check size={16} />
                    <span>{busy ? 'Verifying...' : 'Verify & Launch Nexcord'}</span>
                  </button>

                  <div className="nc-otp-resend-row">
                    <span className="nc-muted">Didn&apos;t receive SMS?</span>
                    <button
                      type="button"
                      className="nc-link-btn"
                      disabled={cooldown > 0 || busy}
                      onClick={() => handleSendOtp()}
                    >
                      {cooldown > 0 ? `Resend in ${formatCooldown(cooldown)}` : 'Resend Code'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div>
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
                  <div className="nc-password-field-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      required
                    />
                    <button
                      type="button"
                      className="nc-pw-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
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

                <button type="submit" className="nc-btn primary full nc-btn-glow" disabled={busy}>
                  {busy ? 'Connecting...' : mode === 'login' ? 'Log In to Nexcord' : 'Create Squad Account'}
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
                  {mode === 'login' ? 'Need an account? Register free' : 'Already have an account? Log In'}
                </button>
              </div>
            </div>
          )}

          {/* Mobile APK Download Card (shown on <=900px) */}
          <div className="nc-apk-banner mobile-apk">
            <div className="nc-apk-left">
              <div className="nc-apk-icon">
                <Smartphone size={18} />
              </div>
              <div>
                <div className="nc-apk-title">Nexcord for Android (v1.1)</div>
                <div className="nc-apk-sub">Latest Material 3 UI &amp; UX build</div>
              </div>
            </div>
            <a
              href={getApkDownloadUrl()}
              download="Nexcord-Flutter.apk"
              className="nc-btn primary xs nc-apk-btn"
            >
              <Download size={13} />
              <span>Download APK</span>
            </a>
          </div>

          <div className="nc-auth-server-cfg">
            <button type="button" className="nc-link-btn muted" onClick={() => setShowServerUrl((v) => !v)}>
              {showServerUrl ? 'Hide Server Endpoint' : 'Configure Custom Server URL'}
            </button>
          </div>
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
  initialTab?: 'create' | 'join';
  onCreate: (name: string, template: 'gaming' | 'standard') => Promise<void>;
  onJoinInvite: (code: string) => Promise<void>;
  onClose: () => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ initialTab = 'create', onCreate, onJoinInvite, onClose }) => {
  const [tab, setTab] = useState<'create' | 'join'>(initialTab);
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
          <div className="nc-modal-title-ico">
            <Gamepad2 size={18} style={{ color: 'var(--blurple)' }} />
            <h3>{tab === 'create' ? 'Create Your Squad Server' : 'Join a Server'}</h3>
          </div>
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
              <div className="nc-field">
                <span>CHOOSE SERVER TEMPLATE</span>
                <div className="nc-template-cards">
                  <button
                    type="button"
                    className={`nc-template-card ${template === 'gaming' ? 'active' : ''}`}
                    onClick={() => setTemplate('gaming')}
                  >
                    <Gamepad2 size={20} className="nc-tpl-ico" />
                    <div>
                      <strong>Gaming &amp; Live Streams</strong>
                      <small>Squad Chat Room, Radar Map, 60 FPS Live Stage &amp; Voice</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`nc-template-card ${template === 'standard' ? 'active' : ''}`}
                    onClick={() => setTemplate('standard')}
                  >
                    <MessageSquare size={20} className="nc-tpl-ico" />
                    <div>
                      <strong>Standard Community</strong>
                      <small>Clean #general text channels &amp; voice lounges</small>
                    </div>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <label className="nc-field">
              <span>SERVER ID OR INVITE CODE</span>
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="Paste Server ID or Invite Code"
                required
                autoFocus
              />
              <span className="nc-field-hint">
                Enter the unique Server ID or invite code shared by your squad leader to join immediately.
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
  users?: Record<string, User>;
  onUpdateServer: (patch: { name?: string; description?: string; iconColor?: string; iconUrl?: string; bannerUrl?: string }) => Promise<void>;
  onCreateRole: (name: string, color: string, perms: Record<string, boolean>) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onSetRole?: (userId: string, roleId: string) => Promise<void>;
  onRegenInvite: () => Promise<void>;
  onDeleteServer: () => Promise<void>;
  onClose: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  server,
  me,
  users = {},
  onUpdateServer,
  onCreateRole,
  onDeleteRole,
  onSetRole,
  onRegenInvite,
  onDeleteServer,
  onClose,
}) => {
  const [tab, setTab] = useState<'overview' | 'roles' | 'members' | 'invites'>('overview');
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [iconColor, setIconColor] = useState(server.iconColor || '#5865F2');
  const [iconUrl, setIconUrl] = useState(server.iconUrl || '');
  const [bannerUrl, setBannerUrl] = useState(server.bannerUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Server icon image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setIconUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Server banner image must be under 8MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBannerUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateServer({
        name: name.trim() || server.name,
        description: description.trim(),
        iconColor,
        iconUrl: iconUrl.trim(),
        bannerUrl: bannerUrl.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
    } finally {
      setIsSaving(false);
    }
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
            Overview & Profile
          </button>
          <button type="button" className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
            Members & Roles ({server.members.length})
          </button>
          <button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>
            Hierarchy & Roles
          </button>
          <button type="button" className={tab === 'invites' ? 'active' : ''} onClick={() => setTab('invites')}>
            Invites & ID
          </button>
        </div>

        <div className="nc-modal-body">
          {tab === 'overview' && (
            <>
              {/* Live Preview Card */}
              <div style={{
                marginBottom: 16,
                background: '#1e1f22',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: 68,
                  background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #2b2d31, #1e1f22)',
                  position: 'relative',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                }}>
                  <span style={{
                    position: 'absolute',
                    top: 6,
                    right: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(0,0,0,0.4)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}>
                    LIVE PREVIEW
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', position: 'relative' }}>
                  <div style={{ marginTop: -24, flexShrink: 0 }}>
                    {iconUrl ? (
                      <img
                        src={iconUrl}
                        alt="Server Icon"
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '3px solid #1e1f22',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: '50%',
                          background: iconColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 19,
                          fontWeight: 700,
                          color: '#fff',
                          border: '3px solid #1e1f22',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        }}
                      >
                        {(name || server.name).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name || 'Server Name'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {description || 'No description set'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 1. Server Picture / Icon */}
              <div className="nc-field">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Camera size={14} /> SERVER ICON / PICTURE
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {iconUrl ? (
                      <img
                        src={iconUrl}
                        alt="Server Icon"
                        style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.15)' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: '50%',
                          background: iconColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 22,
                          fontWeight: 700,
                          color: '#fff',
                          border: '2px solid rgba(255,255,255,0.15)',
                        }}
                      >
                        {(name || server.name).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label className="nc-btn sm primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Upload size={14} />
                        <span>Upload Image</span>
                        <input type="file" accept="image/*" onChange={handleIconUpload} style={{ display: 'none' }} />
                      </label>
                      {iconUrl && (
                        <button type="button" className="nc-btn sm secondary" onClick={() => setIconUrl('')}>
                          <Trash2 size={13} />
                          <span>Remove Picture</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Or paste an image URL (https://...)"
                      value={iconUrl}
                      onChange={(e) => setIconUrl(e.target.value)}
                      style={{ fontSize: 12.5, padding: '7px 10px' }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Server Banner Picture */}
              <div className="nc-field" style={{ marginTop: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ImageIcon size={14} /> SERVER BANNER (OPTIONAL)
                </span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label className="nc-btn sm secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Upload size={14} />
                    <span>Upload Banner</span>
                    <input type="file" accept="image/*" onChange={handleBannerUpload} style={{ display: 'none' }} />
                  </label>
                  {bannerUrl && (
                    <button type="button" className="nc-btn sm secondary" onClick={() => setBannerUrl('')}>
                      <Trash2 size={13} />
                      <span>Remove Banner</span>
                    </button>
                  )}
                  <input
                    type="text"
                    placeholder="Or banner URL (https://...)"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    style={{ fontSize: 12.5, padding: '7px 10px', flex: 1, minWidth: 180 }}
                  />
                </div>
              </div>

              {/* 3. Server Name */}
              <label className="nc-field" style={{ marginTop: 12 }}>
                <span>SERVER NAME</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Squad Name" />
              </label>

              {/* 4. Server Description */}
              <label className="nc-field" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>SERVER DESCRIPTION / ABOUT</span>
                  <span style={{ fontSize: 11, color: description.length > 450 ? '#ED4245' : 'var(--text-muted)' }}>
                    {description.length}/500
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder="Tell new members what your squad, clan, or gaming server is all about..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    resize: 'vertical',
                    minHeight: 65,
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    color: '#f2f3f5',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              {/* 5. Theme Color Swatch */}
              <div className="nc-field" style={{ marginTop: 12 }}>
                <span>SERVER THEME ACCENT COLOR</span>
                <div className="nc-color-row" style={{ marginTop: 6 }}>
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

              {/* Actions */}
              <div className="nc-modal-actions spread" style={{ marginTop: 20 }}>
                {isOwner ? (
                  <button
                    type="button"
                    className="nc-btn danger"
                    onClick={async () => {
                      if (confirm(`Are you sure you want to permanently delete '${server.name}'? This cannot be undone.`)) {
                        await onDeleteServer();
                        onClose();
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Delete Server</span>
                  </button>
                ) : (
                  <span />
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="nc-btn secondary" onClick={onClose} disabled={isSaving}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="nc-btn primary"
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{ minWidth: 120, justifyContent: 'center' }}
                  >
                    {isSaving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: '#b5bac1', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Crown size={15} style={{ color: '#fee75c' }} />
                <span>
                  {server.ownerId === me.id
                    ? 'You are the Group Leader. You can promote members to Co-Leader, Elder, or demote them.'
                    : server.myPermissions?.canPromote
                    ? 'You are a Co-Leader. You can promote members to Elder or demote to Member.'
                    : 'Group members and their assigned roles in this server.'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {server.members.map((m) => {
                  const u = users[m.userId] || {
                    id: m.userId,
                    username: m.userId,
                    displayName: m.userId,
                    avatarColor: '#5865F2',
                    status: 'offline',
                    createdAt: 0,
                  };
                  const isOwnerTarget = m.userId === server.ownerId;
                  const isSelf = m.userId === me.id;

                  // Find primary role
                  const currentRoleId = isOwnerTarget
                    ? 'leader'
                    : m.roles.find((r) => r === 'leader' || r === 'co-leader' || r === 'elder') || 'member';

                  return (
                    <div
                      key={m.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderRadius: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160, flex: 1 }}>
                        <Avatar user={u} size={36} />
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13.5, color: '#f2f3f5' }}>
                              {u.displayName || u.username} {isSelf ? '(You)' : ''}
                            </span>
                            {isOwnerTarget && <span title="Group Leader"><Crown size={13} style={{ color: '#fee75c' }} /></span>}
                            {currentRoleId === 'co-leader' && <span title="Co-Leader"><Star size={13} style={{ color: '#eb459e' }} /></span>}
                            {currentRoleId === 'elder' && <span title="Elder"><Shield size={13} style={{ color: '#57f287' }} /></span>}
                          </div>
                          <span style={{ fontSize: 11, color: '#949ba4' }}>@{u.username}</span>
                        </div>
                      </div>

                      {/* Role selection pills */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {isOwnerTarget ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#fee75c',
                              background: 'rgba(254, 231, 92, 0.15)',
                              padding: '4px 10px',
                              borderRadius: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Crown size={12} /> Leader
                          </span>
                        ) : (
                          [
                            { id: 'co-leader', label: 'Co-Leader', icon: '⭐', color: '#eb459e', allowed: server.ownerId === me.id },
                            { id: 'elder', label: 'Elder', icon: '🛡️', color: '#57f287', allowed: server.ownerId === me.id || Boolean(server.myPermissions?.canPromote) },
                            { id: 'member', label: 'Member', icon: '👤', color: '#949ba4', allowed: server.ownerId === me.id || Boolean(server.myPermissions?.canPromote) },
                          ].map((roleChoice) => {
                            const isCurrent = currentRoleId === roleChoice.id;
                            const canChange = roleChoice.allowed && onSetRole && !isSelf;

                            return (
                              <button
                                key={roleChoice.id}
                                type="button"
                                disabled={!canChange}
                                onClick={() => {
                                  if (canChange && onSetRole) {
                                    onSetRole(m.userId, roleChoice.id);
                                  }
                                }}
                                style={{
                                  fontSize: 11,
                                  fontWeight: isCurrent ? 700 : 500,
                                  padding: '4px 8px',
                                  borderRadius: 12,
                                  border: isCurrent ? `1.5px solid ${roleChoice.color}` : '1px solid rgba(255,255,255,0.1)',
                                  background: isCurrent ? `${roleChoice.color}25` : 'rgba(0,0,0,0.2)',
                                  color: isCurrent ? roleChoice.color : canChange ? '#dbdee1' : '#6d6f78',
                                  cursor: canChange ? 'pointer' : 'default',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  transition: 'all 0.15s ease',
                                }}
                                title={isCurrent ? `Currently ${roleChoice.label}` : canChange ? `Promote to ${roleChoice.label}` : `Permission required`}
                              >
                                <span>{roleChoice.icon}</span>
                                <span>{roleChoice.label}</span>
                                {isCurrent && <span>✓</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'roles' && (
            <>
              {/* Hierarchy Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>ROLE HIERARCHY & PRIVILEGES</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                  <div style={{ background: 'rgba(254, 231, 92, 0.08)', border: '1px solid rgba(254, 231, 92, 0.25)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#fee75c', fontWeight: 700, fontSize: 13 }}>
                      <Crown size={14} /> Leader (Owner)
                    </div>
                    <div style={{ fontSize: 11, color: '#dbdee1', marginTop: 3 }}>
                      Full server ownership. Broadcasts live stage, invites, promotes/demotes all roles.
                    </div>
                  </div>
                  <div style={{ background: 'rgba(235, 69, 158, 0.08)', border: '1px solid rgba(235, 69, 158, 0.25)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#eb459e', fontWeight: 700, fontSize: 13 }}>
                      <Star size={14} /> Co-Leader
                    </div>
                    <div style={{ fontSize: 11, color: '#dbdee1', marginTop: 3 }}>
                      Second-in-command. Broadcasts live tournaments/stream, promotes members to Elder, manages channels.
                    </div>
                  </div>
                  <div style={{ background: 'rgba(87, 242, 135, 0.08)', border: '1px solid rgba(87, 242, 135, 0.25)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#57f287', fontWeight: 700, fontSize: 13 }}>
                      <Shield size={14} /> Elder
                    </div>
                    <div style={{ fontSize: 11, color: '#dbdee1', marginTop: 3 }}>
                      Squad moderator. Can kick rulebreakers and manage in-call voice & chat moderation.
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#949ba4', fontWeight: 700, fontSize: 13 }}>
                      👤 Member
                    </div>
                    <div style={{ fontSize: 11, color: '#dbdee1', marginTop: 3 }}>
                      Standard squad participant. Chat, audio/video lobbies, and live audience interaction.
                    </div>
                  </div>
                </div>
              </div>

              <div className="nc-role-list">
                {server.roles.map((r) => (
                  <div key={r.id} className="nc-role-row">
                    <span className="nc-role-dot" style={{ background: r.color }} />
                    <span className="nc-role-name">{r.name}</span>
                    <span className="nc-role-perms">
                      {r.id === 'leader' ? '👑 Leader • Full Owner' : r.id === 'co-leader' ? '⭐ Co-Leader • Stream & Promote' : r.id === 'elder' ? '🛡️ Elder • Moderation' : r.permissions.admin ? 'Administrator' : r.permissions.manageChannels ? 'Manage Channels' : 'Member'}
                    </span>
                    {server.myPermissions.admin && r.id !== 'leader' && r.id !== 'co-leader' && r.id !== 'elder' && r.id !== 'member' && (
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
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

          <div className="nc-apk-banner">
            <div className="nc-apk-left">
              <div className="nc-apk-icon">
                <Smartphone size={18} />
              </div>
              <div>
                <div className="nc-apk-title">Nexcord for Android (v1.1)</div>
                <div className="nc-apk-sub">Download the latest updated mobile app APK</div>
              </div>
            </div>
            <a
              href={getApkDownloadUrl()}
              download="Nexcord-Flutter.apk"
              className="nc-btn primary xs nc-apk-btn"
            >
              <Download size={13} />
              <span>Download APK</span>
            </a>
          </div>

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
  onSetRole?: (userId: string, roleId: string) => void;
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
  onSetRole,
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
              <label>GROUP ROLE & PROMOTION</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div className="nc-role-pills">
                  {server.roles.map((r) => {
                    const has = member.roles.includes(r.id) || (r.id === 'leader' && user.id === server.ownerId);
                    const isOwnerTarget = user.id === server.ownerId;
                    const canEditThisRole =
                      !isMe &&
                      !isOwnerTarget &&
                      (server.ownerId === me.id
                        ? true
                        : (Boolean(server.myPermissions?.canPromote) && r.id !== 'leader' && r.id !== 'co-leader'));

                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`nc-role-pill ${has ? 'has' : ''}`}
                        disabled={!canEditThisRole || (!onSetRole && !onToggleRole)}
                        onClick={() => {
                          if (onSetRole) onSetRole(user.id, r.id);
                          else onToggleRole?.(user.id, r.id);
                        }}
                        style={{
                          cursor: canEditThisRole ? 'pointer' : 'default',
                          opacity: has ? 1 : canEditThisRole ? 0.85 : 0.45,
                        }}
                        title={
                          has
                            ? `Current Role: ${r.name}`
                            : canEditThisRole
                            ? `Promote/Set as ${r.name}`
                            : `Only Leader can assign this role`
                        }
                      >
                        <span className="nc-role-dot" style={{ background: r.color }} />
                        <span>{r.name}</span>
                        {has && <span style={{ marginLeft: 3, fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>

                {!isMe && (server.ownerId === me.id || server.myPermissions?.canPromote) && user.id !== server.ownerId && (
                  <div style={{ fontSize: 11, color: '#949ba4', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {server.ownerId === me.id ? (
                      <>
                        <Crown size={12} style={{ color: '#fee75c' }} />
                        <span>Group Leader: Click a role above to promote or demote this member.</span>
                      </>
                    ) : (
                      <>
                        <Star size={12} style={{ color: '#eb459e' }} />
                        <span>Co-Leader: You can promote members to Elder or Member.</span>
                      </>
                    )}
                  </div>
                )}
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
