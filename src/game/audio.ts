import type { GameSettings, WeaponId } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientActive = false;
  private ambientGain: GainNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private lobbyTimer: number | null = null;
  private muted = false;
  private masterVol = 0.75;
  private sfxVol = 0.85;
  private musicVol = 0.55;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(1.5);
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  public syncSettings(settings: GameSettings): void {
    this.muted = settings.muted;
    this.masterVol = settings.masterVolume;
    this.sfxVol = settings.sfxVolume;
    this.musicVol = settings.musicVolume;
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVol, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVol, now, 0.03);
  }

  private createNoiseBuffer(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public startAmbience(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.ambientActive) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.045;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start();

    this.ambientSource = src;
    this.ambientGain = gain;
    this.ambientActive = true;
  }

  public stopAmbience(): void {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
        this.ambientSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.ambientSource = null;
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
    this.ambientActive = false;
  }

  public startLobbyPulse(): void {
    if (this.lobbyTimer !== null || typeof window === 'undefined') return;
    const playStep = () => {
      if (!this.ctx || !this.musicGain || this.muted || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.exponentialRampToValueAtTime(54.2, now + 1.8);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(190, now);
      filter.frequency.exponentialRampToValueAtTime(340, now + 0.9);
      filter.frequency.exponentialRampToValueAtTime(140, now + 1.9);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.95);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 2.0);
    };
    playStep();
    this.lobbyTimer = window.setInterval(playStep, 2200);
  }

  public stopLobbyPulse(): void {
    if (this.lobbyTimer !== null) {
      window.clearInterval(this.lobbyTimer);
      this.lobbyTimer = null;
    }
  }

  public playGunshot(weaponId: WeaponId, distance = 0): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    if (distance > 125) return;
    const now = this.ctx.currentTime;
    const atten = distance <= 2 ? 1 : Math.max(0.05, 1 - distance / 125);
    const pitchJitter = 0.92 + Math.random() * 0.16;

    // Noise blast
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq =
      weaponId === 'longshot_dmr'
        ? 1450
        : weaponId === 'breacher_shotgun'
          ? 650
          : weaponId === 'vortex_smg'
            ? 2100
            : 1200;
    filter.frequency.setValueAtTime(baseFreq * pitchJitter, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.16);
    filter.Q.value = weaponId === 'longshot_dmr' ? 1.2 : 0.7;

    const noiseGain = this.ctx.createGain();
    const duration =
      weaponId === 'breacher_shotgun'
        ? 0.24
        : weaponId === 'longshot_dmr'
          ? 0.28
          : weaponId === 'vortex_smg'
            ? 0.1
            : 0.15;
    const vol = (weaponId === 'breacher_shotgun' ? 0.45 : 0.32) * atten;
    noiseGain.gain.setValueAtTime(vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + duration + 0.02);

    // Low punch oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    const startHz =
      weaponId === 'breacher_shotgun' ? 140 : weaponId === 'longshot_dmr' ? 190 : 170;
    osc.frequency.setValueAtTime(startHz * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);

    oscGain.gain.setValueAtTime(0.28 * atten, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playReload(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const clicks = [0, 0.28];
    clicks.forEach((offset, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 0 ? 780 : 1120, now + offset);
      osc.frequency.exponentialRampToValueAtTime(240, now + offset + 0.045);
      gain.gain.setValueAtTime(0.09, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.055);
    });
  }

  public playFootstep(sprinting = false): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = (sprinting ? 440 : 320) * (0.9 + Math.random() * 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(sprinting ? 0.08 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.08);
  }

  public playHitmarker(isKill: boolean): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isKill ? 1320 : 940, now);
    osc.frequency.exponentialRampToValueAtTime(isKill ? 660 : 520, now + (isKill ? 0.14 : 0.06));
    gain.gain.setValueAtTime(isKill ? 0.18 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isKill ? 0.15 : 0.065));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playPlayerHurt(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playPickup(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    [520, 780].forEach((hz, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz, now + i * 0.055);
      gain.gain.setValueAtTime(0.09, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.1);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.11);
    });
  }

  public playZoneWarning(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    [0, 0.22].forEach((offset) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now + offset);
      osc.frequency.linearRampToValueAtTime(480, now + offset + 0.16);
      gain.gain.setValueAtTime(0.09, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.19);
    });
  }

  public playOutcomeSting(victory: boolean): void {
    if (!this.ctx || !this.musicGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = victory ? [261.6, 329.6, 392.0, 523.25] : [220, 196, 164.8, 130.8];
    notes.forEach((hz, idx) => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = victory ? 'triangle' : 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = victory ? 1600 : 520;
      const t = now + idx * 0.14;
      osc.frequency.setValueAtTime(hz, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public playSupplyDrop(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.25);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playUiClick(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }
}

export const soundEngine = new SoundEngine();
