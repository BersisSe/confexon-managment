// Speaker-list actions shared by the GSL, moderated caucus and single speaker.
// All writes go through the offline-safe db layer and register an undo.
import { db } from './db'
import { pushUndo } from './undo'
import type { Speaker } from './types'

const T = 'cmd_speakers'
const nowIso = () => new Date().toISOString()
export const elapsedNow = (s: Speaker) => s.elapsed_ms + (s.running_since ? Math.max(0, Date.now() - new Date(s.running_since).getTime()) : 0)
const restore = (s: Speaker) => ({
  elapsed_ms: s.elapsed_ms, running_since: s.running_since, finished_at: s.finished_at,
  duration_seconds: s.duration_seconds, yielded_to: s.yielded_to, position: s.position,
})

export function addSpeaker(
  sessionId: string, delegateId: string, seconds: number, all: Speaker[], label: string,
  opts: { list?: Speaker['list']; motion_id?: string | null } = {},
) {
  const position = Math.max(0, ...all.map((s) => s.position)) + 1
  const { row } = db.insert(T, {
    session_id: sessionId, delegate_id: delegateId, position, duration_seconds: seconds,
    elapsed_ms: 0, running_since: null, finished_at: null, yielded_to: null, yielded_from: null,
    list: opts.list ?? 'gsl', motion_id: opts.motion_id ?? null,
  })
  pushUndo(label, () => db.remove(T, { id: row.id }))
}

export function toggleTimer(s: Speaker) {
  const patch = s.running_since
    ? { elapsed_ms: elapsedNow(s), running_since: null }
    : { running_since: nowIso() }
  db.update(T, patch, { id: s.id })
}

export function resetTimer(s: Speaker, label: string) {
  const before = restore(s)
  db.update(T, { elapsed_ms: 0, running_since: null }, { id: s.id })
  pushUndo(label, () => db.update(T, before, { id: s.id }))
}

export function finishRaw(s: Speaker, extra: Record<string, unknown> = {}) {
  db.update(T, { finished_at: nowIso(), running_since: null, elapsed_ms: elapsedNow(s), ...extra }, { id: s.id })
  const before = restore(s)
  return () => db.update(T, before, { id: s.id })
}
export function finish(s: Speaker, label: string) {
  pushUndo(label, finishRaw(s))
}

export function removeSpeaker(s: Speaker, label: string) {
  const copy = { ...s }
  db.remove(T, { id: s.id })
  pushUndo(label, () => db.insert(T, copy))
}

export function adjustTime(s: Speaker, deltaSeconds: number, label: string) {
  const before = restore(s)
  const dur = Math.max(5, s.duration_seconds + deltaSeconds)
  db.update(T, { duration_seconds: dur }, { id: s.id })
  pushUndo(label, () => db.update(T, before, { id: s.id }))
}

export function moveSpeaker(queue: Speaker[], s: Speaker, dir: -1 | 1, label: string) {
  const i = queue.findIndex((x) => x.id === s.id)
  const other = queue[i + dir]
  if (i < 0 || !other) return
  const a = s.position
  const b = other.position
  db.update(T, { position: b }, { id: s.id })
  db.update(T, { position: a }, { id: other.id })
  pushUndo(label, () => {
    db.update(T, { position: a }, { id: s.id })
    db.update(T, { position: b }, { id: other.id })
  })
}

export function yieldToChair(s: Speaker, label: string) {
  pushUndo(label, finishRaw(s, { yielded_to: 'chair' }))
}

export function yieldToQuestions(s: Speaker, label: string) {
  db.update(T, { yielded_to: 'questions' }, { id: s.id })
  pushUndo(label, () => db.update(T, { yielded_to: null }, { id: s.id }))
}

// The remaining time passes to another delegate, who speaks next and cannot yield again.
export function yieldToDelegate(
  s: Speaker, delegateId: string, remainingMs: number, queue: Speaker[], label: string,
) {
  const undoFinish = finishRaw(s, { yielded_to: 'delegate' })
  const first = Math.min(...queue.map((x) => x.position), s.position)
  const { row } = db.insert(T, {
    session_id: s.session_id, delegate_id: delegateId, position: first - 1,
    duration_seconds: Math.max(5, Math.ceil(remainingMs / 1000)),
    elapsed_ms: 0, running_since: null, finished_at: null, yielded_to: null, yielded_from: s.delegate_id,
    list: s.list, motion_id: s.motion_id,
  })
  pushUndo(label, () => { db.remove(T, { id: row.id }); undoFinish() })
}
