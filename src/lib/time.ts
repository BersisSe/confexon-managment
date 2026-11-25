export function fmt(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
// Remaining ms for anything with a duration + pause-safe timestamp timer.
export function left(totalMs: number, elapsedMs: number, runningSince: string | null, now: number) {
  const live = runningSince ? Math.max(0, now - new Date(runningSince).getTime()) : 0
  return Math.max(0, totalMs - elapsedMs - live)
}
