/**
 * Non-spatial interface sounds: clicks, chimes, cues. Web Audio rather than
 * <audio> for low latency and overlapping plays. For sounds placed in the 3D
 * scene, use AudioManager / useOneShotAudio instead.
 *
 * Handles the two iPad traps: the context starts suspended until the first
 * tap (any tap unlocks it), and silent mode mutes web audio unless the session
 * is "playback" (Safari 17+).
 */

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function context(): AudioContext {
  if (ctx) return ctx;
  const nav = navigator as AudioSessionNavigator;
  if (nav.audioSession) nav.audioSession.type = 'playback';
  ctx = new AudioContext();
  const unlock = () => { if (ctx!.state === 'suspended') ctx!.resume(); };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('click', unlock, true);
  return ctx;
}

/** Fetches and decodes ahead of time, so the first play is not late. */
export function preloadSound(url: string): Promise<AudioBuffer | null> {
  let pending = buffers.get(url);
  if (!pending) {
    const audio = context();
    pending = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => audio.decodeAudioData(data))
      .catch(() => null);
    buffers.set(url, pending);
  }
  return pending;
}

export interface PlaySoundOptions {
  /** 0..1 and above; 1 is the file as recorded. */
  volume?: number;
  /** 1 is normal speed and pitch. */
  rate?: number;
}

/** Plays a sound once; loads it first if it was not preloaded. */
export async function playSound(url: string, { volume = 1, rate = 1 }: PlaySoundOptions = {}) {
  const audio = context();
  if (audio.state === 'suspended') audio.resume();
  const buffer = await preloadSound(url);
  if (!buffer) return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(audio.destination);
  source.start();
}
