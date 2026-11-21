import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Maximize2,
} from 'lucide-react';
import type { CallSessionState, Channel, User, VoiceParticipant } from '../types';
import { nexconn } from '../services/nexconn';
import { Avatar } from './Avatar';
import { SOUNDS, playSoundEffect } from '../services/soundboard';

interface VoiceCallStageProps {
  channel?: Channel | null;
  serverId?: string | null;
  voiceParticipants?: VoiceParticipant[];
  callState: CallSessionState;
  me: User;
  users: Record<string, User>;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onHangup: () => void;
  onInviteUser?: (userId: string) => void;
}

interface VoiceTileProps {
  uid: string;
  isMe: boolean;
  u?: User;
  vp?: VoiceParticipant;
  callState: CallSessionState;
}

function loadJitsiExternalApi(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).JitsiMeetExternalAPI) {
    return Promise.resolve((window as any).JitsiMeetExternalAPI);
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('jitsi-external-api-script');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).JitsiMeetExternalAPI));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'jitsi-external-api-script';
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => resolve((window as any).JitsiMeetExternalAPI);
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

interface JitsiStageProps {
  channel?: Channel | null;
  serverId?: string | null;
  callState: CallSessionState;
  me: User;
  onHangup: () => void;
}

const JitsiStage: React.FC<JitsiStageProps> = ({
  channel,
  serverId,
  callState,
  me,
  onHangup,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const jitsiApiRef = useRef<any>(null);

  const cleanId = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const roomName = useMemo(() => {
    if (channel) {
      const srvPart = cleanId(serverId || 'srv');
      const chPart = cleanId(channel.id || 'voice');
      return `nexcord_${srvPart}_${chPart}`;
    }
    const targetPart = cleanId(callState.targetLabel || callState.callId || 'call');
    return `nexcord_${targetPart}`;
  }, [channel, serverId, callState.targetLabel, callState.callId]);

  useEffect(() => {
    let cancelled = false;

    // Free local audio/video hardware so Jitsi has 100% exclusive access
    nexconn.stopMediaTracks();

    loadJitsiExternalApi()
      .then((JitsiMeetExternalAPI) => {
        if (cancelled || !containerRef.current) return;
        setLoading(false);

        try {
          const api = new JitsiMeetExternalAPI('meet.jit.si', {
            roomName,
            parentNode: containerRef.current,
            width: '100%',
            height: '100%',
            userInfo: {
              displayName: me.displayName || me.username || 'Squad Player',
              avatarURL: me.avatarUrl || undefined,
            },
            configOverwrite: {
              startWithAudioMuted: false,
              startWithVideoMuted: true,
              prejoinPageEnabled: false,
              prejoinConfig: { enabled: false },
              disableDeepLinking: true,
              enableWelcomePage: false,
              enableClosePage: false,
              enableNoisyMicDetection: false,
              disableInviteFunctions: true,
              toolbarButtons: [
                'microphone',
                'camera',
                'desktop',
                'tileview',
                'fullscreen',
                'hangup',
                'toggle-camera',
                'videoquality',
              ],
            },
            interfaceConfigOverwrite: {
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
              SHOW_BRAND_WATERMARK: false,
              SHOW_POWERED_BY: false,
              TOOLBAR_ALWAYS_VISIBLE: true,
              DEFAULT_REMOTE_DISPLAY_NAME: 'Squad Member',
            },
          });

          jitsiApiRef.current = api;

          api.addEventListener('videoConferenceLeft', () => {
            onHangup();
          });
          api.addEventListener('readyToClose', () => {
            onHangup();
          });
        } catch (err: any) {
          console.error('Failed to init Jitsi API:', err);
          setLoadError(err?.message || 'Failed to initialize video relay');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(err?.message || 'Failed to load video engine');
      });

    return () => {
      cancelled = true;
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
        jitsiApiRef.current = null;
      }
    };
  }, [roomName, me.displayName, me.username, me.avatarUrl, onHangup]);

  return (
    <div className="nc-jitsi-wrapper">
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#0d0e12',
            zIndex: 10,
            color: '#dbdee1',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '3px solid rgba(88, 101, 242, 0.2)',
              borderTopColor: '#5865F2',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Connecting to Global SFU Relay...</span>
          <span style={{ fontSize: 11, color: '#949ba4' }}>Room: {roomName}</span>
        </div>
      )}
      {loadError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#0d0e12',
            zIndex: 10,
            color: '#ED4245',
            padding: 20,
            textAlign: 'center',
          }}
        >
          <p style={{ fontWeight: 600 }}>Relay Notice: {loadError}</p>
          <span style={{ fontSize: 12, color: '#949ba4' }}>
            Switch to "Native Mesh" mode above to continue calling directly over P2P.
          </span>
        </div>
      )}
      <div ref={containerRef} className="nc-jitsi-container" />
    </div>
  );
};

const VoiceTile: React.FC<VoiceTileProps> = ({
  uid,
  isMe,
  u,
  vp,
  callState,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasLiveFrames, setHasLiveFrames] = useState(false);

  const muted = isMe ? callState.micMuted : !!vp?.muted;
  const deafened = isMe ? callState.deafened : !!vp?.deafened;
  const isStreaming = isMe ? callState.screenSharing : !!vp?.streaming;
  const isVideoExpected = isMe
    ? !!(callState.cameraEnabled || callState.screenSharing)
    : callState.isGroup
      ? !!(vp?.video || vp?.streaming)
      : !!(callState.mediaType === 'video' || nexconn.hasLiveRemoteVideo(uid));

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (isMe) {
      if (isVideoExpected) {
        nexconn.bindLocalVideo(el);
        setHasLiveFrames(true);
      } else {
        el.srcObject = null;
        setHasLiveFrames(false);
      }
    } else {
      if (isVideoExpected) {
        nexconn.bindRemoteVideo(uid, el);

        const checkPlaying = () => {
          if (el.videoWidth > 0) {
            setHasLiveFrames(true);
            if (el.paused) el.play().catch(() => {});
          } else if (el.srcObject && el.paused) {
            el.play().catch(() => {});
          }
        };

        checkPlaying();
        el.addEventListener('loadeddata', checkPlaying);
        el.addEventListener('playing', checkPlaying);
        el.addEventListener('canplay', checkPlaying);
        el.addEventListener('resize', checkPlaying);
        const poll = setInterval(checkPlaying, 500);

        return () => {
          clearInterval(poll);
          el.removeEventListener('loadeddata', checkPlaying);
          el.removeEventListener('playing', checkPlaying);
          el.removeEventListener('canplay', checkPlaying);
          el.removeEventListener('resize', checkPlaying);
        };
      } else {
        el.srcObject = null;
        setHasLiveFrames(false);
        nexconn.bindRemoteVideo(uid, null);
      }
    }
  }, [isMe, uid, isVideoExpected, callState.cameraEnabled, callState.screenSharing]);

  const showVideo = isMe ? isVideoExpected : (isVideoExpected && hasLiveFrames);

  return (
    <div
      className={`nc-voice-tile ${!muted ? 'active' : ''} ${isStreaming ? 'streaming-tile' : ''}`}
      onClick={() => {
        nexconn.unlockAudio();
        const el = videoRef.current;
        if (el && el.paused) el.play().catch(() => {});
      }}
      onTouchStart={() => {
        nexconn.unlockAudio();
        const el = videoRef.current;
        if (el && el.paused) el.play().catch(() => {});
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.paused) v.play().catch(() => {});
        }}
        onCanPlay={(e) => {
          const v = e.currentTarget;
          if (v.paused) v.play().catch(() => {});
        }}
        className="nc-voice-video"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: isStreaming ? 'contain' : 'cover',
          backgroundColor: '#0a0d14',
          zIndex: showVideo ? 2 : 0,
          opacity: showVideo ? 1 : 0,
          pointerEvents: showVideo ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />
      <div
        className="nc-voice-avatar-center"
        style={{
          zIndex: 1,
          display: showVideo ? 'none' : 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar user={u} size={76} speaking={!muted} />
        {!isMe && isVideoExpected && !hasLiveFrames && (
          <span
            style={{
              fontSize: 11,
              color: '#FEE75C',
              background: 'rgba(0,0,0,0.65)',
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 500,
            }}
          >
            Connecting video...
          </span>
        )}
      </div>
      <div className="nc-voice-tile-footer" style={{ zIndex: 5 }}>
        <span className="nc-voice-name">
          {u?.displayName || uid} {isMe ? '(You)' : ''}
        </span>
        <div className="nc-voice-badges">
          {showVideo && (
            <button
              type="button"
              style={{
                background: 'rgba(0, 0, 0, 0.55)',
                border: 'none',
                color: '#fff',
                borderRadius: 4,
                padding: '2px 4px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
              onClick={(e) => {
                e.stopPropagation();
                const el = videoRef.current;
                if (el) {
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  } else if (el.requestFullscreen) {
                    el.requestFullscreen().catch(() => {});
                  }
                }
              }}
              title="Fullscreen / Popout"
            >
              <Maximize2 size={13} />
            </button>
          )}
          {isStreaming && <span className="nc-live-mini">LIVE</span>}
          {deafened && <VolumeX size={14} className="danger-ico" />}
          {muted ? <MicOff size={14} className="danger-ico" /> : <Mic size={14} className="ok-ico" />}
        </div>
      </div>
    </div>
  );
};

export const VoiceCallStage: React.FC<VoiceCallStageProps> = ({
  channel,
  serverId,
  voiceParticipants = [],
  callState,
  me,
  users,
  onToggleMic,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onHangup,
  onInviteUser,
}) => {
  const [showInvite, setShowInvite] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);

  const [engineMode, setEngineMode] = useState<'sfu' | 'mesh'>(() => {
    try {
      const saved = localStorage.getItem('nc_voice_engine');
      if (saved === 'sfu' || saved === 'mesh') return saved;
    } catch {}
    return 'sfu';
  });

  const handleSwitchEngine = (mode: 'sfu' | 'mesh') => {
    setEngineMode(mode);
    try {
      localStorage.setItem('nc_voice_engine', mode);
    } catch {}
    if (mode === 'mesh') {
      nexconn.ensureLocalMedia(true, false).catch(() => {});
    } else {
      nexconn.stopMediaTracks();
    }
  };

  const participantIds = useMemo(
    () =>
      Array.from(
        new Set([
          me.id,
          ...voiceParticipants.map((v) => v.userId),
          ...callState.peerIds,
        ]),
      ),
    [me.id, voiceParticipants, callState.peerIds],
  );

  const inviteCandidates = Object.values(users).filter(
    (u) => u.id !== me.id && !participantIds.includes(u.id),
  );
  const peerStates = callState.peerIds.map((id) => nexconn.getPeerConnectionState(id));
  const connectedPeers = peerStates.filter((state) => state === 'connected').length;
  const peerStatus = peerStates.length === 0
    ? 'Waiting for peers'
    : connectedPeers === peerStates.length
      ? 'P2P Connected'
      : peerStates.some((state) => state === 'failed')
        ? 'Connection failed'
        : `${connectedPeers}/${peerStates.length} connected`;

  return (
    <div className="nc-voice-stage">
      <div className="nc-voice-stage-head">
        <div className="nc-voice-title">
          <span className="nc-voice-live-dot" />
          <span className="nc-voice-title-text">
            {channel ? `Voice Connected — ${channel.name}` : `Call — ${callState.targetLabel || 'Direct Call'}`}
          </span>

          {/* Engine Mode Toggle */}
          <div className="nc-voice-engine-toggle" title="Switch voice & video relay engine">
            <button
              type="button"
              className={`nc-voice-engine-btn ${engineMode === 'sfu' ? 'sfu-active' : ''}`}
              onClick={() => handleSwitchEngine('sfu')}
              title="Global SFU Relay — 100% reliable on 4G/5G mobile, zero NAT drops, no audio cutting"
            >
              <span>⚡ Global SFU</span>
            </button>
            <button
              type="button"
              className={`nc-voice-engine-btn ${engineMode === 'mesh' ? 'active' : ''}`}
              onClick={() => handleSwitchEngine('mesh')}
              title="Native Discord Mesh — Direct WebRTC P2P"
            >
              <span>🎮 Native Mesh</span>
            </button>
          </div>

          <span
            role="status"
            style={{
              fontSize: 11,
              color: engineMode === 'sfu' ? '#57F287' : (connectedPeers === peerStates.length && peerStates.length > 0 ? '#57F287' : '#F0B232'),
              background: engineMode === 'sfu' ? 'rgba(87,242,135,0.12)' : (connectedPeers === peerStates.length && peerStates.length > 0 ? 'rgba(87,242,135,0.12)' : 'rgba(240,178,50,0.12)'),
              padding: '2px 8px',
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            {engineMode === 'sfu' ? '● SFU Relay Active' : peerStatus}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Soundboard Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="nc-btn xs secondary"
              onClick={() => setShowSoundboard((v) => !v)}
              title="Squad Soundboard 🔊"
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Volume2 size={14} />
              <span className="desktop-only">Soundboard</span>
            </button>
            {showSoundboard && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 8,
                  background: '#1e1f22',
                  borderRadius: 14,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  padding: 12,
                  width: 250,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                  zIndex: 100,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#949ba4',
                    letterSpacing: 0.5,
                  }}
                >
                  <span>SQUAD SOUNDBOARD 🔊</span>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#57F287',
                      background: 'rgba(87,242,135,0.15)',
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}
                  >
                    LIVE SFX
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {SOUNDS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      style={{
                        background: '#2b2d31',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        color: '#fff',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#383a40')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#2b2d31')}
                      onClick={() => playSoundEffect(s.id)}
                    >
                      <span style={{ fontSize: 16 }}>{s.emoji}</span>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {onInviteUser && inviteCandidates.length > 0 && (
            <div className="nc-voice-invite-wrap">
              <button
                type="button"
                className="nc-btn xs secondary"
                onClick={() => setShowInvite((v) => !v)}
              >
                <UserPlus size={14} />
                <span className="desktop-only">Invite</span>
              </button>
              {showInvite && (
                <div className="nc-popover-menu">
                  <div className="nc-popover-title">Invite to Call</div>
                  {inviteCandidates.slice(0, 6).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="nc-popover-item"
                      onClick={() => {
                        onInviteUser(u.id);
                        setShowInvite(false);
                      }}
                    >
                      <Avatar user={u} size={22} />
                      <span>{u.displayName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="nc-btn xs danger"
            onClick={onHangup}
            title="Leave Voice Channel"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <PhoneOff size={14} />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {engineMode === 'sfu' ? (
        <JitsiStage
          channel={channel}
          serverId={serverId}
          callState={callState}
          me={me}
          onHangup={onHangup}
        />
      ) : (
        <>
          <div className="nc-voice-grid">
            {participantIds.map((uid) => {
              const isMe = uid === me.id;
              const u = isMe ? me : users[uid];
              const vp = voiceParticipants.find((v) => v.userId === uid);
              return (
                <VoiceTile
                  key={uid}
                  uid={uid}
                  isMe={isMe}
                  u={u}
                  vp={vp}
                  callState={callState}
                />
              );
            })}
          </div>

          <div className="nc-voice-dock">
            <button
              type="button"
              className={`nc-dock-btn ${callState.micMuted ? 'off' : ''}`}
              onClick={onToggleMic}
              title={callState.micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {callState.micMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              type="button"
              className={`nc-dock-btn ${callState.deafened ? 'off' : ''}`}
              onClick={onToggleDeafen}
              title={callState.deafened ? 'Undeafen' : 'Deafen'}
            >
              {callState.deafened ? <VolumeX size={20} /> : <Headphones size={20} />}
            </button>

            <button
              type="button"
              className={`nc-dock-btn ${callState.cameraEnabled ? 'active' : ''}`}
              onClick={onToggleCamera}
              title={callState.cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
            >
              {callState.cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>

            <button
              type="button"
              className={`nc-dock-btn ${callState.screenSharing ? 'active' : ''}`}
              onClick={onToggleScreenShare}
              title="Share Screen"
            >
              <MonitorUp size={20} />
            </button>

            <button
              type="button"
              className="nc-dock-btn hangup"
              onClick={onHangup}
              title="Disconnect Call"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

interface IncomingCallModalProps {
  caller?: User | null;
  callerId: string;
  isVideo: boolean;
  onAcceptAudio: () => void;
  onAcceptVideo: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  caller,
  callerId,
  isVideo,
  onAcceptAudio,
  onAcceptVideo,
  onDecline,
}) => {
  return (
    <div className="nc-modal-backdrop">
      <div className="nc-incoming-call-card">
        <div className="nc-incoming-ring">
          <PhoneIncoming size={18} />
          <span>Incoming {isVideo ? 'Video' : 'Voice'} Call</span>
        </div>
        <Avatar user={caller} name={callerId} size={84} speaking />
        <h3>{caller?.displayName || callerId}</h3>
        <p>@{caller?.username || callerId}</p>
        <div className="nc-incoming-actions">
          <button type="button" className="nc-btn danger" onClick={onDecline}>
            <PhoneOff size={16} />
            <span>Decline</span>
          </button>
          <button type="button" className="nc-btn green" onClick={onAcceptAudio}>
            <PhoneCall size={16} />
            <span>Audio</span>
          </button>
          <button type="button" className="nc-btn primary" onClick={onAcceptVideo}>
            <Video size={16} />
            <span>Video</span>
          </button>
        </div>
      </div>
    </div>
  );
};
