// Write layer for the chair console, built for flaky conference wifi.
//
// Every write is applied to local state immediately (optimistic), then sent.
// If the network is down the write goes to a persistent outbox and is replayed
// in order once the connection returns, so the chair is never blocked.
import { ref } from 'vue'
import { supabase } from './supabase'

export interface Op {
  opId: string
  table: string
  kind: 'insert' | 'update' | 'delete' | 'upsert'
  payload?: unknown
  match?: Record<string, unknown>
  onConflict?: string
}

const KEY = 'cmd-outbox-v1'
const UUID_TABLES = new Set(['cmd_speakers', 'cmd_motions', 'cmd_votes', 'cmd_sessions'])

function load(): Op[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pending.value)) } catch { /* storage unavailable */ }
}

export const pending = ref<Op[]>(load())
export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
export const syncing = ref(false)

// Lets readers tell that their snapshot may be older than a write of ours.
export const writes = { count: 0, inFlight: 0 }

type Listener = (op: Op) => void
const listeners = new Set<Listener>()
export function onLocal(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emitLocal = (op: Op) => listeners.forEach((fn) => fn(op))

function isNetworkError(e: { message?: string; code?: string } | null) {
  if (!e) return false
  const m = (e.message ?? '').toLowerCase()
  return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed') || m === ''
}

async function exec(op: Op) {
  const t = supabase.from(op.table)
  let q
  if (op.kind === 'insert') q = t.insert(op.payload as never)
  else if (op.kind === 'upsert') q = t.upsert(op.payload as never, op.onConflict ? { onConflict: op.onConflict } : undefined)
  else {
    q = op.kind === 'update' ? t.update(op.payload as never) : t.delete()
    for (const [k, v] of Object.entries(op.match ?? {})) q = q.eq(k, v as never)
  }
  return (await q).error
}

function enqueue(op: Op) {
  pending.value = [...pending.value, op]
  save()
}

export async function flush() {
  if (syncing.value || !pending.value.length) return
  syncing.value = true
  try {
    while (pending.value.length) {
      const op = pending.value[0]!
      const error = await exec(op).catch((e) => ({ message: String(e) }))
      if (isNetworkError(error)) break
      if (error) console.warn('Dropped outbox op', op.table, op.kind, error.message)
      pending.value = pending.value.slice(1)
      save()
    }
  } finally {
    syncing.value = false
  }
}

async function run(op: Omit<Op, 'opId'>) {
  const full: Op = { ...op, opId: crypto.randomUUID() }
  writes.count++
  emitLocal(full)
  if (pending.value.length || !online.value) {
    enqueue(full)
    return { error: null, queued: true }
  }
  writes.inFlight++
  const error = await exec(full).catch((e) => ({ message: String(e) }))
  writes.inFlight--
  if (isNetworkError(error)) {
    enqueue(full)
    return { error: null, queued: true }
  }
  return { error: error ? new Error(error.message) : null, queued: false }
}

export const db = {
  insert<T extends Record<string, unknown>>(table: string, row: T) {
    const full = UUID_TABLES.has(table) && !('id' in row) ? { id: crypto.randomUUID(), ...row } : row
    return { row: full as T & { id: string }, done: run({ table, kind: 'insert', payload: full }) }
  },
  update(table: string, patch: Record<string, unknown>, match: Record<string, unknown>) {
    return run({ table, kind: 'update', payload: patch, match })
  },
  upsert(table: string, row: unknown, onConflict?: string) {
    return run({ table, kind: 'upsert', payload: row, onConflict })
  },
  remove(table: string, match: Record<string, unknown>) {
    return run({ table, kind: 'delete', match })
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online.value = true; flush() })
  window.addEventListener('offline', () => { online.value = false })
  setInterval(() => { if (pending.value.length && online.value) flush() }, 4000)
}
