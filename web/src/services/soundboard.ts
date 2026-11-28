// Discord-style Web Audio Synthesized Soundboard

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export type SoundEffect = 'airhorn' | 'victory' | 'applause' | 'level_up' | 'badumtss' | 'quack';

export interface SoundboardItem {
  id: SoundEffect;
  name: string;
  emoji: string;
  desc: string;
}

export const SOUNDS: SoundboardItem[] = [
  { id: 'airhorn', name: 'Airhorn', emoji: '🎺', desc: 'Hype horn blast' },
  { id: 'victory', name: 'Victory GG', emoji: '👑', desc: 'Triumphant chime' },
  { id: 'level_up', name: 'Level Up', emoji: '⚡', desc: '8-bit power up' },
  { id: 'badumtss', name: 'Ba-Dum-Tss', emoji: '🥁', desc: 'Rimshot joke sting' },
  { id: 'quack', name: 'Quack', emoji: '🦆', desc: 'Funny duck quack' },
  { id: 'applause', name: 'Claps', emoji: '👏', desc: 'Crowd applause' },
];

export function playSoundEffect(id: SoundEffect): void {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    switch (id) {
      case 'airhorn': {
        // Dual saw oscillators with pitch bend
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';

        osc1.frequency.setValueAtTime(466.16, now); // Bb4
        osc1.frequency.exponentialRampToValueAtTime(440, now + 0.35);

        osc2.frequency.setValueAtTime(470, now);
        osc2.frequency.exponentialRampToValueAtTime(442, now + 0.35);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.4);
        osc2.stop(now + 0.4);
        break;
      }

      case 'victory': {
        // C5 -> E5 -> G5 -> C6 arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);

          gain.gain.setValueAtTime(0.18, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.35);
        });
        break;
      }

      case 'level_up': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.25);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.28);
        break;
      }

      case 'badumtss': {
        // Kick + rimshot + noise sizzle
        const kick = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kick.frequency.setValueAtTime(150, now);
        kick.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        kickGain.gain.setValueAtTime(0.3, now);
        kickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        kick.connect(kickGain);
        kickGain.connect(ctx.destination);
        kick.start(now);
        kick.stop(now + 0.15);

        // Second hit (dum)
        const kick2 = ctx.createOscillator();
        const kickGain2 = ctx.createGain();
        kick2.frequency.setValueAtTime(180, now + 0.15);
        kick2.frequency.exponentialRampToValueAtTime(45, now + 0.27);
        kickGain2.gain.setValueAtTime(0.3, now + 0.15);
        kickGain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        kick2.connect(kickGain2);
        kickGain2.connect(ctx.destination);
        kick2.start(now + 0.15);
        kick2.stop(now + 0.3);

        // Tss (high noise)
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 4000;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.15, now + 0.3);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        noise.start(now + 0.3);
        noise.stop(now + 0.55);
        break;
      }

      case 'quack': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }

      case 'applause': {
        // Burst of soft rhythmic noise
        const bufferSize = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.6;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
        noise.stop(now + 0.5);
        break;
      }
    }
  } catch (err) {
    console.warn('Soundboard audio error', err);
  }
}

export function playRingtonePulse(kind: 'incoming' | 'outgoing' = 'incoming'): void {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    if (kind === 'incoming') {
      const notes = [523.25, 659.25];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.14 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.36);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.38);
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    }
  } catch {
    // ignore autoplay restriction before user gesture
  }
}
