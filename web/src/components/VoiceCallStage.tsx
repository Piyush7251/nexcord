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
import { api } from '../services/api';
import { Avatar } from './Avatar';
import { SOUNDS, playSoundEffect } from '../services/soundboard';

interface VoiceCallStageProps {
  serverId?: string;
  channel?: Channel | null;
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
  const hasLiveRemote = !isMe && nexconn.hasLiveRemoteVideo(uid);
  const isVideoExpected = isMe
    ? !!(callState.cameraEnabled || callState.screenSharing)
    : !!(vp?.video || vp?.streaming || hasLiveRemote);

  // Sync video stream changes and track events for remote peers
  useEffect(() => {
    if (isMe) return;

    const syncTracks = () => {
      const el = videoRef.current;
      const stream = nexconn.getRemoteStream(uid);
      const liveTracks = stream?.getVideoTracks().filter((t) => t.readyState === 'live' && !t.muted) || [];

      if (liveTracks.length === 0) {
        setHasLiveFrames(false);
        return;
      }

      if (el) {
        const curId = (el.srcObject as MediaStream)?.getVideoTracks?.()[0]?.id;
        if (!el.srcObject || curId !== liveTracks[0].id) {
          el.srcObject = new MediaStream(liveTracks);
        }
        if (el.paused) el.play().catch(() => {});
        if (el.videoWidth > 0) setHasLiveFrames(true);
      }
    };

    syncTracks();
    const unsub = nexconn.subscribe(syncTracks);

    const stream = nexconn.getRemoteStream(uid);
    if (stream) {
      stream.addEventListener('addtrack', syncTracks);
      stream.addEventListener('removetrack', syncTracks);
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('unmute', syncTracks);
        t.addEventListener('mute', syncTracks);
        t.addEventListener('ended', syncTracks);
      });
    }

    return () => {
      unsub();
      if (stream) {
        stream.removeEventListener('addtrack', syncTracks);
        stream.removeEventListener('removetrack', syncTracks);
        stream.getVideoTracks().forEach((t) => {
          t.removeEventListener('unmute', syncTracks);
          t.removeEventListener('mute', syncTracks);
          t.removeEventListener('ended', syncTracks);
        });
      }
    };
  }, [isMe, uid]);

  // Video element binding & playback watchdog
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
      return;
    }

    // Remote peer: ALWAYS bind remote video element so when remote video tracks arrive or toggle on,
    // nexconn immediately mounts the MediaStream and starts playback without waiting for a re-render.
    nexconn.bindRemoteVideo(uid, el);

    const checkPlaying = () => {
      if (!el) return;
      const vTracks = (el.srcObject as MediaStream)?.getVideoTracks?.() || [];
      const hasLiveTrack = vTracks.some((t) => t.readyState === 'live' && !t.muted);

      if (hasLiveTrack && el.videoWidth > 0) {
        setHasLiveFrames(true);
        if (el.paused) el.play().catch(() => {});
      } else if (hasLiveTrack) {
        if (el.paused) el.play().catch(() => {});
        if (el.videoWidth > 0) setHasLiveFrames(true);
      } else {
        if (!hasLiveRemote && !vp?.video && !vp?.streaming) {
          setHasLiveFrames(false);
        }
      }
    };

    checkPlaying();
    el.addEventListener('loadeddata', checkPlaying);
    el.addEventListener('playing', checkPlaying);
    el.addEventListener('canplay', checkPlaying);
    el.addEventListener('resize', checkPlaying);
    el.addEventListener('timeupdate', checkPlaying);
    const poll = setInterval(checkPlaying, 250);

    return () => {
      clearInterval(poll);
      el.removeEventListener('loadeddata', checkPlaying);
      el.removeEventListener('playing', checkPlaying);
      el.removeEventListener('canplay', checkPlaying);
      el.removeEventListener('resize', checkPlaying);
      el.removeEventListener('timeupdate', checkPlaying);
      nexconn.bindRemoteVideo(uid, null);
    };
  }, [isMe, uid, isVideoExpected, hasLiveRemote]);

  const showVideo = isMe
    ? isVideoExpected
    : (hasLiveFrames || (hasLiveRemote && isVideoExpected));

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
  serverId,
  channel,
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
  const [, setTick] = useState(0);

  // Subscribe to nexconn changes and poll so peer connection states,
  // ICE updates, and track additions immediately update the badge and video tiles
  useEffect(() => {
    const unsub = nexconn.subscribe(() => setTick((t) => t + 1));
    const interval = setInterval(() => setTick((t) => t + 1), 500);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

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

  const remotePeerIds = useMemo(
    () => participantIds.filter((id) => id !== me.id),
    [participantIds, me.id]
  );

  const peerStates = remotePeerIds.map((id) => nexconn.getPeerConnectionState(id));
  const connectedRemotePeers = peerStates.filter((state) => state === 'connected').length;

  const totalCount = participantIds.length;
  // Local user is connected (1) + number of remote peers whose WebRTC connection is connected
  const connectedCount = 1 + connectedRemotePeers;
  const isAllConnected = totalCount > 1 && connectedRemotePeers === remotePeerIds.length;

  const peerStatus =
    totalCount <= 1
      ? 'Waiting for squad (1/1)'
      : isAllConnected
        ? `P2P Connected (${connectedCount}/${totalCount})`
        : peerStates.some((state) => state === 'failed')
          ? `Connection failed (${connectedCount}/${totalCount})`
          : `Connecting (${connectedCount}/${totalCount})`;

  const badgeColor =
    totalCount <= 1
      ? '#949ba4'
      : isAllConnected
        ? '#57F287'
        : peerStates.some((s) => s === 'failed')
          ? '#ED4245'
          : '#F0B232';

  const badgeBg =
    totalCount <= 1
      ? 'rgba(255, 255, 255, 0.08)'
      : isAllConnected
        ? 'rgba(87, 242, 135, 0.12)'
        : peerStates.some((s) => s === 'failed')
          ? 'rgba(237, 66, 69, 0.12)'
          : 'rgba(240, 178, 50, 0.12)';

  return (
    <div className="nc-voice-stage">
      <div className="nc-voice-stage-head">
        <div className="nc-voice-title">
          <span className="nc-voice-live-dot" />
          <span className="nc-voice-title-text">
            {channel ? `Voice Connected — ${channel.name}` : `Call — ${callState.targetLabel || 'Direct Call'}`}
          </span>
          <span
            role="status"
            style={{
              fontSize: 11,
              color: badgeColor,
              background: badgeBg,
              padding: '2px 8px',
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            {peerStatus}
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

          {/* Quick Launch Test Peer in isolated second window */}
          <button
            type="button"
            className="nc-btn xs secondary"
            onClick={async () => {
              try {
                const res = await api.demoLogin();
                if (res?.session) {
                  const srvId = serverId || '';
                  const chId = channel?.id || '';
                  const url = `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(res.session)}${srvId ? `&serverId=${encodeURIComponent(srvId)}` : ''}${chId ? `&channelId=${encodeURIComponent(chId)}&autoJoin=1` : ''}`;
                  window.open(url, '_blank', 'width=520,height=820,left=80,top=80');
                }
              } catch {
                window.alert('Failed to launch test window');
              }
            }}
            title="Open an isolated 2nd window with a separate player ID to test voice/video instantly without logging out"
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#57F287' }}
          >
            <UserPlus size={14} />
            <span className="desktop-only">+ Test Player</span>
          </button>

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
