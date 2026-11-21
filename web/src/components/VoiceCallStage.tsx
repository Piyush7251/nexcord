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
  const isVideoExpected = isMe
    ? !!(callState.cameraEnabled || callState.screenSharing)
    : !!(vp?.video || vp?.streaming);

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
          <span className="nc-sdk-chip desktop-only">@nexconn/call</span>
          <span
            role="status"
            style={{
              fontSize: 11,
              color: connectedPeers === peerStates.length && peerStates.length > 0 ? '#57F287' : '#F0B232',
              background: connectedPeers === peerStates.length && peerStates.length > 0 ? 'rgba(87,242,135,0.12)' : 'rgba(240,178,50,0.12)',
              padding: '2px 8px',
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            {peerStatus}
          </span>
        </div>
        {onInviteUser && inviteCandidates.length > 0 && (
          <div className="nc-voice-invite-wrap">
            <button
              type="button"
              className="nc-btn xs secondary"
              onClick={() => setShowInvite((v) => !v)}
            >
              <UserPlus size={14} />
              <span>Invite to Call</span>
            </button>
            {showInvite && (
              <div className="nc-popover-menu">
                <div className="nc-popover-title">Invite via NCCallEngine.inviteToCall</div>
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

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={`nc-dock-btn ${showSoundboard ? 'active' : ''}`}
            onClick={() => setShowSoundboard((v) => !v)}
            title="Squad Soundboard 🔊"
          >
            <Volume2 size={20} />
          </button>
          {showSoundboard && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 12,
              background: '#1e1f22',
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              padding: 12,
              width: 250,
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
              zIndex: 100,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, fontWeight: 700, color: '#949ba4', letterSpacing: 0.5 }}>
                <span>SQUAD SOUNDBOARD 🔊</span>
                <span style={{ fontSize: 10, color: '#57F287', background: 'rgba(87,242,135,0.15)', padding: '1px 5px', borderRadius: 4 }}>LIVE SFX</span>
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
          <span>Incoming {isVideo ? 'Video' : 'Voice'} Call via @nexconn/call</span>
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
