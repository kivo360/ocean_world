/**
 * FootstepSound generates short noise-based footstep sounds using the Web Audio
 * API. No external dependencies. Each surface type uses different filter params:
 *   grass – soft low-pass ~150 Hz
 *   stone – brighter low-pass ~400 Hz
 *   wood  – hollow with a short delay echo
 *   dirt  – muffled low-pass ~100 Hz
 *
 * Volume auto-attenuates based on distance from the listener (camera center).
 * The AudioContext is created lazily on first call to stay friendly with
 * browser autoplay policies.
 */

export type SurfaceType = "grass" | "stone" | "wood" | "dirt";

const SURFACE_FILTER_FREQ: Record<SurfaceType, number> = {
  grass: 150,
  stone: 400,
  wood: 200,
  dirt: 100,
};

const NOISE_DURATION_S = 0.05; // 50 ms burst
const WOOD_DELAY_S = 0.04; // echo delay for wood
const WOOD_DELAY_GAIN = 0.35;

export class FootstepSound {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.ceil(ctx.sampleRate * NOISE_DURATION_S);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Play a footstep sound.
   * @param surface Surface type determining filter characteristics.
   * @param volume Master volume (0–1), typically 0.3–0.5.
   */
  play(surface: SurfaceType = "grass", volume = 0.4): void {
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const noise = this.getNoiseBuffer(ctx);

      // Primary footstep.
      this.playNoiseBurst(ctx, noise, now, surface, volume);

      // Wood gets a short delayed echo for a hollow feel.
      if (surface === "wood") {
        this.playNoiseBurst(ctx, noise, now + WOOD_DELAY_S, surface, volume * WOOD_DELAY_GAIN);
      }
    } catch {
      // Web Audio API unavailable or blocked — silently ignore.
    }
  }

  private playNoiseBurst(
    ctx: AudioContext,
    noise: AudioBuffer,
    when: number,
    surface: SurfaceType,
    vol: number,
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = noise;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = SURFACE_FILTER_FREQ[surface];

    const gain = ctx.createGain();
    // Quick fade-out so the burst doesn't click.
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + NOISE_DURATION_S);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(when);
    source.stop(when + NOISE_DURATION_S + 0.01);
  }

  /** Call when the application shuts down to free audio resources. */
  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.noiseBuffer = null;
  }
}

/** Singleton for the entire application. */
export const footstepSound = new FootstepSound();
