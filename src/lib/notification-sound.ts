let audioContext: AudioContext | null = null;

function getContext() {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function playNotificationSound(kind: "message" | "direct" | "mention" = "message") {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  if (kind === "direct") {
    tone(ctx, 740, now, 0.12, 0.045);
    tone(ctx, 988, now + 0.09, 0.16, 0.035);
  } else if (kind === "mention") {
    tone(ctx, 880, now, 0.10, 0.045);
    tone(ctx, 1175, now + 0.075, 0.14, 0.035);
  } else {
    tone(ctx, 660, now, 0.10, 0.035);
    tone(ctx, 880, now + 0.07, 0.13, 0.025);
  }
}
