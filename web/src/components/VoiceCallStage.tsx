import React, { useEffect, useRef, useState } from 'react';
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
  VolumeX,
} from 'lucide-react';
import type { CallSessionState, Channel, User, VoiceParticipant } from '../types';
import { nexconn } from '../services/nexconn';
import { Avatar } from './Avatar';

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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if ((callState.cameraEnabled || callState.screenSharing) && localVideoRef.current) {
      nexconn.bindLocalVideo(localVideoRef.current);
    }
  }, [callState.cameraEnabled, callState.screenSharing]);

  useEffect(() => {
    for (const pid of callState.peerIds) {
      const el = remoteVideoRefs.current[pid];
      if (el) nexconn.bindRemoteVideo(pid, el);
    }
  }, [callState.peerIds]);

  const participantIds = Array.from(
    new Set([
      me.id,
      ...voiceParticipants.map((v) => v.userId),
      ...callState.peerIds,
    ]),
  );

  const inviteCandidates = Object.values(users).filter(
    (u) => u.id !== me.id && !participantIds.includes(u.id),
  );

  return (
    <div className="nc-voice-stage">
      <div className="nc-voice-stage-head">
        <div className="nc-voice-title">
          <span className="nc-voice-live-dot" />
          <span className="nc-voice-title-text">
            {channel ? `Voice Connected — ${channel.name}` : `Call — ${callState.targetLabel || 'Direct Call'}`}
          </span>
          <span className="nc-sdk-chip desktop-only">@nexconn/call</span>
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
          const muted = isMe ? callState.micMuted : !!vp?.muted;
          const deafened = isMe ? callState.deafened : !!vp?.deafened;
          const hasLocalVideo = isMe && (callState.cameraEnabled || callState.screenSharing);

          return (
            <div key={uid} className={`nc-voice-tile ${!muted ? 'active' : ''}`}>
              {hasLocalVideo ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="nc-voice-video"
                />
              ) : (
                <>
                  <video
                    ref={(el) => {
                      remoteVideoRefs.current[uid] = el;
                      if (el) nexconn.bindRemoteVideo(uid, el);
                    }}
                    autoPlay
                    playsInline
                    className="nc-voice-video"
                  />
                  <div className="nc-voice-avatar-center">
                    <Avatar user={u} size={76} speaking={!muted} />
                  </div>
                </>
              )}
              <div className="nc-voice-tile-footer">
                <span className="nc-voice-name">
                  {u?.displayName || uid} {isMe ? '(You)' : ''}
                </span>
                <div className="nc-voice-badges">
                  {vp?.streaming && <span className="nc-live-mini">LIVE</span>}
                  {deafened && <VolumeX size={14} className="danger-ico" />}
                  {muted ? <MicOff size={14} className="danger-ico" /> : <Mic size={14} className="ok-ico" />}
                </div>
              </div>
            </div>
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
