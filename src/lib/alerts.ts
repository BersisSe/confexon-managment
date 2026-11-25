// Time alerts: a short beep at 10 s left and a double chime at zero.
import { ref, watch, type Ref } from 'vue'

const KEY = 'cmd-sound'
export const soundOn = ref((() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })())
export function toggleSound() {
  soundOn.value = !soundOn.value
  try { localStorage.setItem(KEY, soundOn.value ? 'on' : 'off') } catch { /* ignore */ }
}

let ctx: AudioContext | null = null
function tone(freq: number, start: number, len: number, vol = 0.25) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + start)
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + len)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + start + len + 0.05)
}
export function beep(kind: 'warn' | 'end') {
  if (!soundOn.value) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    if (kind === 'warn') tone(880, 0, 0.18)
    else { tone(660, 0, 0.3, 0.35); tone(520, 0.38, 0.5, 0.35) }
  } catch { /* audio blocked */ }
}

// Watches a countdown (ms). Fires only while it is running.
export function useTimeAlert(remainingMs: Ref<number>, running: Ref<boolean>, enabled: Ref<boolean>) {
  watch(remainingMs, (now, prev) => {
    if (!running.value || !enabled.value || prev === undefined) return
    if (prev > 0 && now <= 0) beep('end')
    else if (prev > 10000 && now <= 10000 && now > 0) beep('warn')
  })
}
