/** WebAudio synthwave loop + SFX. No audio files. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  muted = localStorage.getItem('pole-muted') === '1';

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
  }

  /** call on first user gesture */
  unlock() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.timer) this.startLoop();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('pole-muted', this.muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  private startLoop() {
    // 16-step synthwave pattern at ~100bpm
    const stepDur = 60 / 100 / 2;
    const bass = [55, 55, 65.4, 55, 82.4, 55, 73.4, 65.4, 55, 55, 65.4, 55, 98, 82.4, 73.4, 65.4];
    const tick = () => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime + 0.06;
      const f = bass[this.step % 16];
      // bass
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const fl = this.ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + stepDur * 0.95);
      o.connect(fl); fl.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + stepDur);
      // hat on offbeats
      if (this.step % 2 === 1) {
        const h = this.ctx.createOscillator();
        h.type = 'square';
        h.frequency.value = 7000;
        const hg = this.ctx.createGain();
        hg.gain.setValueAtTime(0.08, t);
        hg.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
        h.connect(hg); hg.connect(this.musicGain);
        h.start(t); h.stop(t + 0.05);
      }
      // sparkle arp every 4 steps
      if (this.step % 4 === 0) {
        const a = this.ctx!.createOscillator();
        a.type = 'triangle';
        a.frequency.value = f * 8;
        const ag = this.ctx!.createGain();
        ag.gain.setValueAtTime(0.06, t);
        ag.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        a.connect(ag); ag.connect(this.musicGain!);
        a.start(t); a.stop(t + 0.32);
      }
      this.step++;
      this.timer = window.setTimeout(tick, stepDur * 1000);
    };
    tick();
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, when = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  coin() { this.blip(1568, 0.09, 'square', 0.12); this.blip(2093, 0.12, 'square', 0.1, 0.07); }
  rain() { for (let i = 0; i < 6; i++) this.blip(1200 + i * 220, 0.08, 'square', 0.08, i * 0.06); }
  cheer() {
    if (!this.ctx || !this.master || this.muted) return;
    // filtered noise swell ~ crowd
    const t = this.ctx.currentTime;
    const len = 1.2;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  pop() { this.blip(660, 0.07, 'triangle', 0.14); }
}
