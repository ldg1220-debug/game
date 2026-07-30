import type { Element } from './gameTypes';

/**
 * 사운드 (완성도 가이드 6절).
 *
 * mp3 에셋 대신 Web Audio API로 합성한다. 저장소에 바이너리를 넣지 않고,
 * 오프라인에서도 동작하며, 속성별 음색을 코드로 조절할 수 있다.
 * 브라우저 자동재생 정책 때문에 첫 사용자 입력 시점에 컨텍스트를 연다.
 */

type Osc = OscillatorType;

interface ToneSpec {
  freq: number;
  /** 종료 주파수. 지정하면 글라이드 */
  toFreq?: number;
  duration: number;
  type: Osc;
  gain?: number;
  /** 시작 지연(초) */
  delay?: number;
}

const STORAGE_KEY = 'stoneage-audio';

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private currentBgm: string | null = null;

  muted = false;
  volume = 0.5;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { muted?: boolean; volume?: number };
        this.muted = saved.muted ?? false;
        this.volume = saved.volume ?? 0.5;
      }
    } catch {
      // 저장값이 없거나 읽을 수 없으면 기본값을 쓴다
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: this.muted, volume: this.volume }));
    } catch {
      // 저장 실패는 무시한다
    }
  }

  /** 사용자 입력 이후에 호출해야 소리가 난다 */
  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.22;
      this.bgmGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopBGM();
    if (this.master && !muted) this.master.gain.value = this.volume;
    this.persist();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
    this.persist();
  }

  private tone(spec: ToneSpec, destination?: AudioNode) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + (spec.delay ?? 0);

    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, start);
    if (spec.toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.toFreq), start + spec.duration);

    const env = ctx.createGain();
    const peak = spec.gain ?? 0.3;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration);

    osc.connect(env);
    env.connect(destination ?? this.master);
    osc.start(start);
    osc.stop(start + spec.duration + 0.02);
  }

  /** 화이트노이즈 버스트. 타격감·바람·흙 소리에 쓴다. */
  private noise(duration: number, gain = 0.2, filterHz = 1200, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    const env = ctx.createGain();
    env.gain.value = gain;

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(start);
  }

  // ─── 효과음 (가이드 6.1) ───

  /** 속성별 공격 효과음 */
  attack(element: Element) {
    switch (element) {
      case 'fire': // 타닥거리는 소리
        this.noise(0.22, 0.22, 2600);
        this.tone({ freq: 320, toFreq: 90, duration: 0.24, type: 'sawtooth', gain: 0.18 });
        break;
      case 'water': // 철렁거리는 소리
        this.tone({ freq: 700, toFreq: 240, duration: 0.26, type: 'sine', gain: 0.26 });
        this.tone({ freq: 980, toFreq: 380, duration: 0.2, type: 'sine', gain: 0.14, delay: 0.05 });
        break;
      case 'earth': // 쿵하는 소리
        this.tone({ freq: 130, toFreq: 48, duration: 0.3, type: 'square', gain: 0.28 });
        this.noise(0.18, 0.16, 500);
        break;
      case 'wind': // 휘이잉 소리
        this.noise(0.35, 0.16, 3200);
        this.tone({ freq: 480, toFreq: 1300, duration: 0.28, type: 'triangle', gain: 0.12 });
        break;
      default: // 펀치 소리
        this.noise(0.12, 0.24, 900);
        this.tone({ freq: 200, toFreq: 80, duration: 0.14, type: 'square', gain: 0.16 });
    }
  }

  /** 피격 */
  hurt() {
    this.noise(0.1, 0.2, 700);
    this.tone({ freq: 180, toFreq: 70, duration: 0.14, type: 'triangle', gain: 0.18 });
  }

  /** 크리티컬 — 높은 음 */
  critical() {
    this.tone({ freq: 1200, duration: 0.07, type: 'square', gain: 0.22 });
    this.tone({ freq: 1800, duration: 0.09, type: 'square', gain: 0.2, delay: 0.06 });
    this.tone({ freq: 2400, duration: 0.12, type: 'sine', gain: 0.16, delay: 0.13 });
  }

  /** 약점 공격 — 밝은 음 */
  superEffective() {
    this.tone({ freq: 880, duration: 0.09, type: 'triangle', gain: 0.2 });
    this.tone({ freq: 1320, duration: 0.14, type: 'triangle', gain: 0.18, delay: 0.07 });
  }

  /** 상태이상 부여 */
  status() {
    this.tone({ freq: 420, toFreq: 220, duration: 0.3, type: 'sine', gain: 0.2 });
    this.tone({ freq: 300, toFreq: 160, duration: 0.32, type: 'sine', gain: 0.12, delay: 0.04 });
  }

  /** 포획 성공 */
  capture() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, duration: 0.16, type: 'triangle', gain: 0.22, delay: i * 0.1 }),
    );
  }

  /** 레벨업 / 진화 */
  fanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, duration: 0.2, type: 'square', gain: 0.16, delay: i * 0.09 }),
    );
  }

  /** 승리 */
  victory() {
    [659, 659, 659, 523, 784].forEach((f, i) =>
      this.tone({ freq: f, duration: 0.18, type: 'triangle', gain: 0.2, delay: i * 0.12 }),
    );
  }

  /** 패배 */
  defeat() {
    [392, 349, 311, 262].forEach((f, i) =>
      this.tone({ freq: f, duration: 0.3, type: 'sine', gain: 0.2, delay: i * 0.18 }),
    );
  }

  /** UI 버튼 */
  click() {
    this.tone({ freq: 660, duration: 0.05, type: 'square', gain: 0.1 });
  }

  /** 필드에서 한 칸 이동 */
  step() {
    this.noise(0.05, 0.06, 420);
  }

  /** 보물 상자 */
  treasure() {
    [784, 988, 1175].forEach((f, i) =>
      this.tone({ freq: f, duration: 0.14, type: 'triangle', gain: 0.18, delay: i * 0.08 }),
    );
  }

  /** 야생 조우 */
  encounter() {
    this.tone({ freq: 300, toFreq: 900, duration: 0.25, type: 'sawtooth', gain: 0.18 });
    this.tone({ freq: 300, toFreq: 900, duration: 0.25, type: 'sawtooth', gain: 0.18, delay: 0.22 });
  }

  // ─── BGM (가이드 6.1) ───

  /**
   * 지역·상황별 BGM. 짧은 음계 루프를 스텝 시퀀서로 돌린다.
   * 완성된 곡은 아니지만 분위기를 만들고 무음보다 낫다.
   */
  private static readonly TRACKS: Record<string, { notes: number[]; tempo: number; type: Osc }> = {
    plains: { notes: [392, 440, 494, 523, 494, 440, 392, 349], tempo: 420, type: 'triangle' },
    forest: { notes: [330, 392, 440, 392, 349, 294, 330, 392], tempo: 460, type: 'sine' },
    mountain: { notes: [262, 311, 349, 311, 392, 349, 311, 262], tempo: 480, type: 'triangle' },
    volcano: { notes: [220, 262, 233, 294, 262, 220, 196, 220], tempo: 380, type: 'sawtooth' },
    glacier: { notes: [523, 587, 659, 587, 523, 494, 440, 494], tempo: 500, type: 'sine' },
    battle: { notes: [330, 330, 392, 330, 294, 262, 294, 330], tempo: 260, type: 'square' },
    boss: { notes: [196, 233, 196, 262, 233, 196, 175, 196], tempo: 240, type: 'sawtooth' },
  };

  playBGM(track: string) {
    if (this.muted) return;
    if (this.currentBgm === track && this.bgmTimer !== null) return;
    this.stopBGM();
    const spec = AudioManager.TRACKS[track];
    if (!spec) return;
    const ctx = this.ensure();
    if (!ctx || !this.bgmGain) return;

    this.currentBgm = track;
    this.bgmStep = 0;
    const bgmDest = this.bgmGain;
    this.bgmTimer = window.setInterval(() => {
      const note = spec.notes[this.bgmStep % spec.notes.length];
      this.tone({ freq: note, duration: spec.tempo / 1000, type: spec.type, gain: 0.12 }, bgmDest);
      // 4스텝마다 베이스
      if (this.bgmStep % 4 === 0) {
        this.tone({ freq: note / 2, duration: (spec.tempo * 2) / 1000, type: 'sine', gain: 0.1 }, bgmDest);
      }
      this.bgmStep++;
    }, spec.tempo);
  }

  stopBGM() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.currentBgm = null;
  }
}

export const audio = new AudioManager();
