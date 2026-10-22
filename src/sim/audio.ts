import type { SimEvent, Telemetry } from "./types";
import { clamp } from "./types";

/**
 * Fully procedural audio: electric motor whine, wind, thruster roar,
 * tyre squeal and landing impact. No external files, no autoplay —
 * the graph is only built after an explicit user gesture.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private whine: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;

  private noiseBuf: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;
  private squealGain: GainNode | null = null;
  private squealFilter: BiquadFilterNode | null = null;

  private volume = 0.7;
  private muted = false;
  private ready = false;

  /** Must be called from a user gesture. */
  async init() {
    if (this.ready) {
      await this.ctx?.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      await ctx.resume();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);

      // --- noise source (shared buffer) ---------------------------------
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      const makeNoise = (filter: BiquadFilterNode, gain: GainNode, playbackRate = 1) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = playbackRate;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.master!);
        src.start();
        return src;
      };

      // --- motor ---------------------------------------------------------
      this.motorFilter = ctx.createBiquadFilter();
      this.motorFilter.type = "lowpass";
      this.motorFilter.frequency.value = 900;
      this.motorFilter.Q.value = 3;
      this.motorGain = ctx.createGain();
      this.motorGain.gain.value = 0;
      this.motorFilter.connect(this.motorGain);
      this.motorGain.connect(this.master);

      this.oscA = ctx.createOscillator();
      this.oscA.type = "sawtooth";
      this.oscA.frequency.value = 60;
      this.oscB = ctx.createOscillator();
      this.oscB.type = "square";
      this.oscB.frequency.value = 61.5;
      const bGain = ctx.createGain();
      bGain.gain.value = 0.35;
      this.oscA.connect(this.motorFilter);
      this.oscB.connect(bGain);
      bGain.connect(this.motorFilter);
      this.oscA.start();
      this.oscB.start();

      // high-frequency inverter whine
      this.whine = ctx.createOscillator();
      this.whine.type = "sine";
      this.whine.frequency.value = 1400;
      this.whineGain = ctx.createGain();
      this.whineGain.gain.value = 0;
      this.whine.connect(this.whineGain);
      this.whineGain.connect(this.master);
      this.whine.start();

      // --- wind ------------------------------------------------------------
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = "bandpass";
      this.windFilter.frequency.value = 520;
      this.windFilter.Q.value = 0.7;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      makeNoise(this.windFilter, this.windGain, 0.6);

      // --- thruster ---------------------------------------------------------
      this.thrustFilter = ctx.createBiquadFilter();
      this.thrustFilter.type = "bandpass";
      this.thrustFilter.frequency.value = 780;
      this.thrustFilter.Q.value = 1.4;
      this.thrustGain = ctx.createGain();
      this.thrustGain.gain.value = 0;
      makeNoise(this.thrustFilter, this.thrustGain, 1.35);

      // --- tyre squeal ---------------------------------------------------------
      this.squealFilter = ctx.createBiquadFilter();
      this.squealFilter.type = "bandpass";
      this.squealFilter.frequency.value = 2100;
      this.squealFilter.Q.value = 14;
      this.squealGain = ctx.createGain();
      this.squealGain.gain.value = 0;
      makeNoise(this.squealFilter, this.squealGain, 0.9);

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }
  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    this.applyMaster();
  }
  private applyMaster() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** Continuous layers driven by telemetry — call once per frame. */
  update(t: Telemetry) {
    if (!this.ready || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const sn = t.speedNorm;

    const base = 48 + sn * 190 + t.rpm * 120;
    this.oscA?.frequency.setTargetAtTime(base, now, 0.08);
    this.oscB?.frequency.setTargetAtTime(base * 1.503, now, 0.08);
    this.motorFilter?.frequency.setTargetAtTime(500 + sn * 2600, now, 0.1);
    this.motorGain?.gain.setTargetAtTime(
      (Math.abs(t.speed) < 0.4 ? 0.018 : 0.03 + sn * 0.1 + t.rpm * 0.035) * (t.airborne ? 0.55 : 1),
      now,
      0.12,
    );
    this.whine?.frequency.setTargetAtTime(1100 + sn * 3200, now, 0.1);
    this.whineGain?.gain.setTargetAtTime(0.004 + sn * 0.022 * (t.airborne ? 0.5 : 1), now, 0.15);

    this.windFilter?.frequency.setTargetAtTime(360 + sn * 900 + (t.airborne ? 320 : 0), now, 0.2);
    this.windGain?.gain.setTargetAtTime(sn * 0.05 + (t.airborne ? 0.05 + t.altitude * 0.004 : 0), now, 0.2);

    this.thrustFilter?.frequency.setTargetAtTime(620 + t.thruster * 900, now, 0.08);
    this.thrustGain?.gain.setTargetAtTime(t.thruster * 0.14, now, 0.06);

    this.squealFilter?.frequency.setTargetAtTime(1750 + t.skid * 900, now, 0.05);
    this.squealGain?.gain.setTargetAtTime(t.airborne ? 0 : clamp(t.skid - 0.25, 0, 1) * 0.075, now, 0.05);
  }

  /** One-shot effects triggered by simulation events. */
  trigger(event: SimEvent) {
    if (!this.ready || !this.ctx || this.muted || !this.master) return;
    switch (event) {
      case "takeoff":
      case "boost":
        this.whoosh(0.7, 180, 2600, 0.2);
        this.thump(70, 0.16);
        break;
      case "touchdown":
        this.thump(46, 0.5);
        this.whoosh(0.35, 900, 180, 0.14);
        this.burst(0.55);
        break;
      case "invert":
        this.whoosh(0.5, 1400, 300, 0.07);
        break;
      case "right":
        this.whoosh(0.45, 320, 1500, 0.06);
        break;
      case "stuntEnd":
        this.blip(880, 0.05);
        window.setTimeout(() => this.blip(1320, 0.04), 90);
        break;
      case "reset":
        this.blip(320, 0.05);
        break;
      case "stuntStart":
        break;
    }
  }

  private thump(freq: number, amp: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 2.2, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * 0.6), now + 0.34);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  private whoosh(dur: number, f0: number, f1: number, amp: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(f0, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  private burst(amp: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2400, now);
    f.frequency.exponentialRampToValueAtTime(220, now + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(now);
    src.stop(now + 0.5);
  }

  private blip(freq: number, amp: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  /** Short UI confirmation click. */
  uiClick() {
    this.blip(1500, 0.028);
  }

  dispose() {
    try {
      this.oscA?.stop();
      this.oscB?.stop();
      this.whine?.stop();
    } catch {
      /* already stopped */
    }
    this.ctx?.close();
    this.ctx = null;
    this.ready = false;
  }
}

export const audio = new AudioEngine();
