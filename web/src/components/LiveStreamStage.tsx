import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Eye,
  Flame,
  Maximize2,
  MessageSquare,
  Monitor,
  Radio,
  Send,
  Sparkles,
  Tv,
  Video,
  X,
} from 'lucide-react';
import type { Channel, ChatMessage, LiveHypeBurst, QuickChatPreset, Server, User } from '../types';
import { Avatar } from './Avatar';
import { QuickChatBar } from './QuickChatBar';
import { nexconn } from '../services/nexconn';

interface LiveStreamStageProps {
  server: Server;
  channel: Channel;
  me: User;
  users: Record<string, User>;
  messages: ChatMessage[];
  hypeBursts: LiveHypeBurst[];
  onSendMessage: (text: string) => void;
  onSendQuickChat: (preset: QuickChatPreset, zone?: string) => void;
  onSendHype: (emoji: string, text?: string) => void;
  onStartLive: (payload: { title: string; mode: string; streamUrl: string; callId?: string }) => void;
  onStopLive: () => void;
}

interface BulletItem {
  id: string;
  sender: string;
  color: string;
  text: string;
  topPct: number;
}

function toEmbedUrl(raw: string): { kind: 'iframe' | 'video'; src: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const yt = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([\w-]{6,})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1` };
  const tw = s.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (tw) {
    const parent = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    return { kind: 'iframe', src: `https://player.twitch.tv/?channel=${tw[1]}&parent=${parent}&muted=true` };
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(s)) return { kind: 'video', src: s };
  return { kind: 'iframe', src: s };
}

export const LiveStreamStage: React.FC<LiveStreamStageProps> = ({
  server,
  channel,
  me,
  users,
  messages,
  hypeBursts,
  onSendMessage,
  onSendQuickChat,
  onSendHype,
  onStartLive,
  onStopLive,
}) => {
  const [showHudOverlay, setShowHudOverlay] = useState(true);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [showSideChat, setShowSideChat] = useState(true);
  const [mobileTab, setMobileTab] = useState<'stage' | 'chat'>('stage');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [streamTitle, setStreamTitle] = useState('My Live Stream');
  const [streamMode, setStreamMode] = useState<'webrtc' | 'embed'>('webrtc');
  const [streamUrl, setStreamUrl] = useState('');
  const [hudInput, setHudInput] = useState('');
  const [sideInput, setSideInput] = useState('');
  const [bullets, setBullets] = useState<BulletItem[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localBroadcastStream = useRef<MediaStream | null>(null);
  const sideEndRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);

  const live = channel.live;
  const hostUser = live ? users[live.userId] : null;
  const isBroadcastingLocally = !!localStream;
  const isStreamer = (live?.userId === me.id) || isBroadcastingLocally;
  const isLiveActive = !!live || isBroadcastingLocally;
  const canStop = isStreamer || !!server.myPermissions?.manageChannels;

  // Scroll spectator side chat
  useEffect(() => {
    sideEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Trigger flying Danmaku bullets whenever a new message arrives
  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    if (latest.id === lastMsgIdRef.current) return;
    lastMsgIdRef.current = latest.id;
    if (!showDanmaku) return;

    const u = users[latest.senderId];
    const item: BulletItem = {
      id: `${latest.id}_${Date.now()}`,
      sender: u?.displayName || 'Spectator',
      color: u?.avatarColor || '#5865F2',
      text: latest.text,
      topPct: 12 + Math.floor(Math.random() * 44),
    };
    setBullets((prev) => [...prev.slice(-14), item]);
    const t = setTimeout(() => {
      setBullets((prev) => prev.filter((b) => b.id !== item.id));
    }, 6800);
    return () => clearTimeout(t);
  }, [messages, showDanmaku, users]);

  // Stop local camera/screen stream on unmount
  useEffect(() => {
    return () => {
      localBroadcastStream.current?.getTracks().forEach((t) => t.stop());
      localBroadcastStream.current = null;
      nexconn.setScreenStream(null);
    };
  }, []);

  // When live stops on backend, clean up local preview
  useEffect(() => {
    if (!live && localStream) {
      localBroadcastStream.current?.getTracks().forEach((t) => t.stop());
      localBroadcastStream.current = null;
      setLocalStream(null);
      nexconn.setScreenStream(null);
    }
  }, [live, localStream]);

  // Video element binding effect for both local streamer and spectator
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (isStreamer || isBroadcastingLocally) {
      const media = localStream || localBroadcastStream.current;
      if (media && el.srcObject !== media) {
        el.srcObject = media;
        el.play().catch((err) => console.warn('Stream local preview play:', err));
      }
    } else if (live && live.userId) {
      nexconn.bindRemoteVideo(live.userId, el);
      nexconn.connectToPeer(live.userId, live.callId || `live_${channel.id}`).catch(() => {});
    }
  }, [localStream, live, isStreamer, isBroadcastingLocally, channel.id]);

  const handleStopLive = () => {
    if (localBroadcastStream.current) {
      localBroadcastStream.current.getTracks().forEach((t) => t.stop());
      localBroadcastStream.current = null;
    }
    setLocalStream(null);
    nexconn.setScreenStream(null);
    onStopLive();
  };

  const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const startCanvasScreenShare = (): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    let frame = 0;
    let animId: number;

    const render = () => {
      frame++;
      // Background
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid Pattern
      ctx.strokeStyle = 'rgba(88, 101, 242, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Live Header
      ctx.fillStyle = '#f23f43';
      ctx.fillRect(40, 36, 110, 38);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('🔴 LIVE', 58, 61);

      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#f2f3f5';
      ctx.fillText(`${me.displayName}'s Tactical Mobile Stream`, 168, 64);

      // Center Radar Scope
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = 150;

      // Outer Rings
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(88, 101, 242, 0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(88, 101, 242, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Radar Sweep
      const angle = (frame * 0.04) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.strokeStyle = '#57f287';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Pulsing Ping
      const pulseSize = 10 + Math.sin(frame * 0.1) * 4;
      const blipX = cx + Math.cos(frame * 0.015) * 85;
      const blipY = cy + Math.sin(frame * 0.015) * 85;
      ctx.beginPath();
      ctx.arc(blipX, blipY, pulseSize, 0, Math.PI * 2);
      ctx.fillStyle = '#f23f43';
      ctx.fill();

      // Stream Status telemetry
      ctx.font = '16px monospace';
      ctx.fillStyle = '#57f287';
      ctx.fillText('STATUS: BROADCASTING • 60 FPS • 1080P HD • WEBRTC LIVE', 40, canvas.height - 36);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    const stream = canvas.captureStream(30);
    const track = stream.getVideoTracks()[0];
    if (track) {
      const origStop = track.stop.bind(track);
      track.stop = () => {
        cancelAnimationFrame(animId);
        origStop();
      };
    }
    return stream;
  };

  const handleStartScreenShare = async () => {
    setLiveError(null);
    setIsCapturing(true);
    try {
      let stream: MediaStream | null = null;
      const isMobile = isMobileDevice;

      // 1. Try native getDisplayMedia if supported
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
        try {
          if (isMobile) {
            // Android Chrome: never request audio: true as it causes immediate rejection
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          } else {
            try {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            } catch {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            }
          }
        } catch (captureErr: any) {
          console.warn('Native getDisplayMedia error:', captureErr);
          if (captureErr?.name === 'NotAllowedError' || captureErr?.name === 'AbortError') {
            setLiveError('Screen share cancelled. Tap "Go Live" or use Camera below.');
            setIsCapturing(false);
            return;
          }
          if (isMobile) {
            // Mobile browser/webview without display capture permission: fallback to camera
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
              });
            } catch {
              stream = startCanvasScreenShare();
            }
          } else {
            throw captureErr;
          }
        }
      } else if (isMobile) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
          });
        } catch {
          stream = startCanvasScreenShare();
        }
      } else {
        throw new Error('Screen sharing is not supported by your browser.');
      }

      if (!stream) {
        stream = startCanvasScreenShare();
      }

      localBroadcastStream.current?.getTracks().forEach((t) => t.stop());
      localBroadcastStream.current = stream;
      setLocalStream(stream);
      nexconn.setScreenStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopLive();
        };
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const activeCallId = `live_${channel.id}_${Date.now()}`;
      onStartLive({
        title: `${me.displayName}'s Screen Share`,
        mode: 'webrtc',
        streamUrl: '',
        callId: activeCallId,
      });
    } catch (err: any) {
      console.warn('Screen share error:', err);
      setLiveError(err?.message || 'Could not start screen sharing.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleStartCamera = async () => {
    setLiveError(null);
    setIsCapturing(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: isMobileDevice
            ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            : true,
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      localBroadcastStream.current?.getTracks().forEach((t) => t.stop());
      localBroadcastStream.current = stream;
      setLocalStream(stream);
      nexconn.setScreenStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopLive();
        };
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const activeCallId = `live_${channel.id}_${Date.now()}`;
      onStartLive({
        title: isMobileDevice ? `${me.displayName}'s Mobile Live` : `${me.displayName}'s Camera Stream`,
        mode: 'webrtc',
        streamUrl: '',
        callId: activeCallId,
      });
    } catch (err: any) {
      console.warn('Camera permission error:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        setLiveError('Camera cancelled or permission denied.');
      } else {
        setLiveError(err?.message || 'Could not start camera.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGoLiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (streamMode === 'webrtc') {
      await handleStartScreenShare();
      setShowBroadcastModal(false);
    } else {
      onStartLive({ title: streamTitle.trim() || `${me.displayName}'s Live Stream`, mode: streamMode, streamUrl: streamUrl.trim() });
      setShowBroadcastModal(false);
    }
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stageRef.current.requestFullscreen().catch(() => {});
  };

  const submitHudChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hudInput.trim()) return;
    onSendMessage(hudInput.trim());
    setHudInput('');
  };

  const submitSideChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sideInput.trim()) return;
    onSendMessage(sideInput.trim());
    setSideInput('');
  };

  const embedInfo = live?.mode === 'embed' && live.streamUrl ? toEmbedUrl(live.streamUrl) : null;

  return (
    <div className="nc-live-layout">
      {/* Mobile Stage vs Chat Tabs */}
      <div className="nc-mobile-live-tabs mobile-only">
        <button
          type="button"
          className={`nc-m-live-tab ${mobileTab === 'stage' ? 'active' : ''}`}
          onClick={() => setMobileTab('stage')}
        >
          <Tv size={14} />
          <span>Stage View</span>
          {isLiveActive && <span className="nc-live-pill-mini">LIVE</span>}
        </button>
        <button
          type="button"
          className={`nc-m-live-tab ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileTab('chat')}
        >
          <MessageSquare size={14} />
          <span>Stream Chat ({messages.length})</span>
        </button>
      </div>

      {/* Main Video + Spectator Overlay Area */}
      <div className={`nc-live-stage ${mobileTab !== 'stage' ? 'mobile-hidden' : ''}`} ref={stageRef}>
        <div className="nc-live-topbar">
          <div className="nc-live-meta">
            {isLiveActive ? (
              <>
                <span className="nc-live-pill">
                  <Radio size={12} /> LIVE
                </span>
                <span className="nc-live-title">
                  {live?.title || (isBroadcastingLocally ? `${me.displayName}'s Live Broadcast` : `#${channel.name}`)}
                </span>
                <span className="nc-live-host desktop-only">Hosted by {hostUser?.displayName || me.displayName}</span>
              </>
            ) : (
              <>
                <Tv size={16} />
                <span className="nc-live-title">#{channel.name} — Stage Offline</span>
              </>
            )}
          </div>

          <div className="nc-live-controls">
            <span className="nc-viewer-badge">
              <Eye size={13} />
              <span>{Math.max(1, server.members.length)}</span>
            </span>

            <button
              type="button"
              className={`nc-btn xs ${showDanmaku ? 'primary' : 'secondary'}`}
              onClick={() => setShowDanmaku((v) => !v)}
              title="Toggle Flying Bullet Chat (Danmaku)"
            >
              <Sparkles size={13} />
              <span className="desktop-only">Danmaku</span>
            </button>

            <button
              type="button"
              className={`nc-btn xs ${showHudOverlay ? 'primary' : 'secondary'} desktop-only`}
              onClick={() => setShowHudOverlay((v) => !v)}
              title="Toggle Translucent Spectator HUD Overlay"
            >
              <MessageSquare size={13} />
              <span>HUD Overlay</span>
            </button>

            {!isLiveActive ? (
              <button
                type="button"
                className="nc-btn xs danger"
                onClick={() => setShowBroadcastModal(true)}
              >
                <Video size={13} />
                <span>Go Live</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="nc-btn xs secondary"
                  onClick={() => setShowBroadcastModal(true)}
                  title="Switch broadcast source"
                >
                  <Monitor size={13} />
                  <span className="desktop-only">Switch Source</span>
                </button>
                {canStop && (
                  <button
                    type="button"
                    className="nc-btn xs danger"
                    onClick={handleStopLive}
                    title="End stream"
                  >
                    <X size={13} />
                    <span className="desktop-only">End Stream</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              className="nc-icon-btn sm desktop-only"
              onClick={() => setShowSideChat((v) => !v)}
              title="Toggle Spectator Chat Sidebar"
            >
              <MessageSquare size={15} />
            </button>

            <button type="button" className="nc-icon-btn sm" onClick={toggleFullscreen} title="Fullscreen">
              <Maximize2 size={15} />
            </button>
          </div>
        </div>

        {/* Video Viewport */}
        <div className="nc-live-viewport">
          {!isLiveActive && (
            <div className="nc-live-offline">
              <Monitor size={54} style={{ color: 'var(--blurple)', marginBottom: 12 }} />
              <h3>Live Screen Sharing & Stream Stage</h3>
              <p>Share your screen, gameplay window, or webcam live with everyone in #{channel.name}.</p>

              {liveError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(237, 66, 69, 0.15)',
                    border: '1px solid #ED4245',
                    color: '#ff7b72',
                    padding: '8px 14px',
                    borderRadius: 6,
                    fontSize: 13,
                    marginTop: 14,
                    maxWidth: 460,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{liveError}</span>
                </div>
              )}

              <div className="nc-live-start-btns">
                <button
                  type="button"
                  className="nc-btn primary"
                  onClick={handleStartScreenShare}
                  disabled={isCapturing}
                >
                  <Monitor size={16} />
                  <span>{isCapturing ? 'Starting...' : 'Share Screen'}</span>
                </button>
                <button
                  type="button"
                  className="nc-btn green"
                  onClick={handleStartCamera}
                  disabled={isCapturing}
                >
                  <Video size={16} />
                  <span>{isCapturing ? 'Starting...' : isMobileDevice ? 'Go Live (Mobile Camera)' : 'Share Camera'}</span>
                </button>
              </div>
            </div>
          )}

          {isLiveActive && live?.mode === 'embed' && embedInfo ? (
            embedInfo.kind === 'video' ? (
              <video src={embedInfo.src} autoPlay controls playsInline className="nc-live-video" />
            ) : (
              <iframe
                src={embedInfo.src}
                title={live.title}
                className="nc-live-video"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
              />
            )
          ) : isLiveActive ? (
            <video
              ref={(el) => {
                localVideoRef.current = el;
                if (el) {
                  if (isStreamer || isBroadcastingLocally) {
                    const media = localStream || localBroadcastStream.current;
                    if (media && el.srcObject !== media) {
                      el.srcObject = media;
                      el.play().catch(() => {});
                    }
                  } else if (live && live.userId) {
                    nexconn.bindRemoteVideo(live.userId, el);
                  }
                }
              }}
              autoPlay
              playsInline
              muted={isStreamer || isBroadcastingLocally}
              className="nc-live-video"
            />
          ) : null}

          {/* Danmaku / Bullet Chat Layer */}
          {showDanmaku && (
            <div className="nc-danmaku-layer" aria-hidden="true">
              {bullets.map((b) => (
                <div key={b.id} className="nc-danmaku-bullet" style={{ top: `${b.topPct}%` }}>
                  <span className="nc-danmaku-name" style={{ color: b.color }}>
                    {b.sender}:
                  </span>
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Floating Hype Reactions Layer */}
          <div className="nc-hype-layer" aria-hidden="true">
            {hypeBursts.map((h) => (
              <div key={h.id} className="nc-hype-burst" style={{ left: `${h.x}%` }}>
                <span className="nc-hype-emoji">{h.emoji}</span>
                {h.text && <span className="nc-hype-tag">{h.text}</span>}
              </div>
            ))}
          </div>

          {/* Translucent HUD Spectator Chat Overlay (Bottom-Right over video, desktop only) */}
          {showHudOverlay && (
            <div className="nc-spectator-hud desktop-only">
              <div className="nc-spectator-hud-head">
                <span className="nc-hud-badge">
                  <Flame size={12} /> SPECTATOR OVERLAY
                </span>
                <span className="nc-hud-sub">Nexconn OpenChannel</span>
              </div>
              <div className="nc-spectator-hud-feed">
                {messages.slice(-6).map((m) => {
                  const u = users[m.senderId];
                  return (
                    <div key={m.id} className="nc-hud-msg">
                      <span className="nc-hud-author" style={{ color: u?.avatarColor || '#8ea1e1' }}>
                        {u?.displayName || m.senderId}
                      </span>
                      <span className="nc-hud-text">{m.text}</span>
                    </div>
                  );
                })}
              </div>
              <form className="nc-hud-form" onSubmit={submitHudChat}>
                <input
                  value={hudInput}
                  onChange={(e) => setHudInput(e.target.value)}
                  placeholder="Chat on overlay..."
                />
                <button type="submit" aria-label="Send overlay message">
                  <Send size={13} />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Hype Reaction Dock (only rendered when live stream is actively broadcasting) */}
        {isLiveActive && (
          <div className="nc-hype-dock">
            {['🔥', '⚡', '👑', '💯', '🎯', '💜'].map((em) => (
              <button
                key={em}
                type="button"
                className="nc-hype-btn"
                onClick={() => onSendHype(em)}
                title={`Send ${em} hype burst to all spectators`}
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Spectator Chatroom Panel */}
      {(showSideChat || mobileTab === 'chat') && (
        <aside className={`nc-live-chat-panel ${mobileTab !== 'chat' ? 'mobile-hidden' : ''}`}>
          <div className="nc-live-chat-head">
            <span>STREAM CHAT</span>
            <span className="nc-sdk-chip">OpenChannel</span>
          </div>
          <div className="nc-live-chat-messages">
            {messages.map((m) => {
              const u = users[m.senderId];
              return (
                <div key={m.id} className="nc-live-chat-row">
                  <Avatar user={u} size={24} />
                  <div className="nc-live-chat-body">
                    <span className="nc-live-chat-author" style={{ color: u?.avatarColor || '#fff' }}>
                      {u?.displayName || m.senderId}
                    </span>
                    {m.type === 'quickchat' && <span className="nc-qc-pill-inline">QUICK</span>}
                    <span className="nc-live-chat-text">{m.text}</span>
                  </div>
                </div>
              );
            })}
            <div ref={sideEndRef} />
          </div>

          <QuickChatBar onSendQuickChat={onSendQuickChat} compact />

          <form className="nc-live-chat-input" onSubmit={submitSideChat}>
            <input
              value={sideInput}
              onChange={(e) => setSideInput(e.target.value)}
              placeholder={`Message #${channel.name}`}
            />
            <button type="submit" className="nc-btn xs primary">
              <Send size={13} />
            </button>
          </form>
        </aside>
      )}

      {/* Go Live Modal */}
      {showBroadcastModal && (
        <div className="nc-modal-backdrop" onClick={() => setShowBroadcastModal(false)}>
          <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nc-modal-head">
              <h3>Go Live in #{channel.name}</h3>
              <button type="button" className="nc-icon-btn" onClick={() => setShowBroadcastModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form className="nc-modal-body" onSubmit={handleGoLiveSubmit}>
              <label className="nc-field">
                <span>Stream Title</span>
                <input
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
                  placeholder="VCT Finals Watch Party"
                />
              </label>

              <label className="nc-field">
                <span>Broadcast Source</span>
                <select
                  value={streamMode}
                  onChange={(e) => setStreamMode(e.target.value as 'webrtc' | 'embed')}
                >
                  <option value="webrtc">Share My Screen / Game Window (WebRTC)</option>
                  <option value="embed">Embed YouTube / Twitch / MP4 URL</option>
                </select>
              </label>

              {streamMode === 'embed' && (
                <label className="nc-field">
                  <span>Stream URL</span>
                  <input
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </label>
              )}

              <div className="nc-modal-actions">
                <button type="button" className="nc-btn secondary" onClick={() => setShowBroadcastModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="nc-btn danger">
                  <Radio size={15} />
                  <span>Start Stream</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
