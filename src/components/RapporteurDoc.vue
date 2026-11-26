<script setup lang="ts">
// One session's rapporteur document: a single writer, everyone else reads live.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import type { JSONContent } from '@tiptap/core'
import { supabase } from '@/lib/supabase'
import { mention } from '@/lib/mention'
import { useAuth } from '@/stores/auth'

interface Content { doc?: JSONContent; motions?: string[] }
interface Row { content: Content; writer_id: string | null; writer_name: string | null }
interface Motion { id: string; kind: string; title: string | null; total_seconds: number | null; created_at: string }

const props = defineProps<{ sessionId: string; countries: string[] }>()
const { t, locale } = useI18n()
const auth = useAuth()
const sid = props.sessionId
const draftKey = `cmd-doc-${sid}`

const row = ref<Row | null>(null)
const loaded = ref(false)
const mine = computed(() => !!row.value?.writer_id && row.value.writer_id === auth.session?.user.id)
const state = ref<'saved' | 'saving' | 'offline'>('saved')
const error = ref('')
const lost = ref('')
let motionIds: string[] = []
let motions: Motion[] = []
let version = 0
let busy = false
let dirty = false
let wasMine = false
let timer: ReturnType<typeof setTimeout> | undefined

const editor = new Editor({
  editable: false,
  extensions: [StarterKit, Highlight, mention(() => props.countries)],
  editorProps: { attributes: { class: 'doc', 'aria-label': t('rapp.title') } },
  onUpdate: () => changed(),
})

const readDraft = (): Content | null => {
  try { return JSON.parse(localStorage.getItem(draftKey) ?? 'null') } catch { return null }
}
const writeDraft = (c: Content | null) => {
  try {
    if (c) localStorage.setItem(draftKey, JSON.stringify(c))
    else localStorage.removeItem(draftKey)
  } catch { /* storage unavailable */ }
}
const current = (): Content => ({ doc: editor.getJSON(), motions: motionIds })
const show = (c: Content) => {
  motionIds = c.motions ?? []
  editor.commands.setContent(c.doc ?? '', { emitUpdate: false })
}

function changed() {
  if (!mine.value) return
  version++
  dirty = true
  state.value = 'saving'
  writeDraft(current())
  clearTimeout(timer)
  timer = setTimeout(save, 1000)
}

async function save() {
  if (busy || !dirty) return
  busy = true
  const sent = version
  const { error: e } = await supabase.rpc('cmd_save_document', { p_session: sid, p_content: current() })
  busy = false
  if (!e) {
    if (sent !== version) return save()
    dirty = false
    writeDraft(null)
    state.value = 'saved'
    error.value = ''
  } else if (e.message.includes('not_writer')) {
    // Someone took over: keep our text available for copying.
    lost.value = editor.getText()
    dirty = false
    writeDraft(null)
    await load()
  } else {
    state.value = 'offline'
    if (e.message.includes('too_large')) error.value = t('rapp.tooLarge')
  }
}

/** The writer's page gets a heading for each newly accepted motion. */
function addMotions() {
  if (!mine.value || !loaded.value) return
  const fresh = motions.filter((m) => !motionIds.includes(m.id))
  if (!fresh.length) return
  motionIds = [...motionIds, ...fresh.map((m) => m.id)]
  const nodes = fresh.flatMap((m) => {
    const parts = [
      t(`rapp.kind.${m.kind}`),
      m.title,
      m.total_seconds ? `${Math.round(m.total_seconds / 60)} ${t('rapp.min')}` : '',
      new Date(m.created_at).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }),
    ].filter(Boolean)
    return [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: parts.join(' · ') }] }, { type: 'paragraph' }]
  })
  if (editor.isEmpty) editor.commands.setContent({ type: 'doc', content: nodes }, { emitUpdate: true })
  else editor.commands.insertContentAt(editor.state.doc.content.size, nodes, { updateSelection: false })
}

async function load() {
  const { data, error: e } = await supabase.from('cmd_documents')
    .select('content, writer_id, writer_name').eq('session_id', sid).maybeSingle()
  if (e) { error.value = t('rapp.loadFailed'); return }
  error.value = ''
  row.value = data as Row | null
  const writing = mine.value
  // The writer's own echo must never overwrite what is being typed.
  if (!writing || !wasMine) {
    const draft = writing ? readDraft() : null
    show(draft ?? row.value?.content ?? {})
    if (draft) { dirty = true; state.value = 'saving'; save() }
  }
  wasMine = writing
  editor.setEditable(writing, false)
  loaded.value = true
  addMotions()
}

async function loadMotions() {
  const { data } = await supabase.from('cmd_motions').select('id, kind, title, total_seconds, created_at')
    .eq('session_id', sid).in('status', ['passed', 'active', 'done']).order('created_at')
  if (!data) return
  motions = data as Motion[]
  addMotions()
}

async function claim(force: boolean) {
  if (force && !window.confirm(t('rapp.confirmTake'))) return
  const { error: e } = await supabase.rpc('cmd_claim_document', { p_session: sid, p_force: force })
  await load()
  if (e) error.value = t(e.message.includes('not_writer') ? 'rapp.taken' : 'rapp.saveFailed')
  else editor.commands.focus('end')
}

const copyLost = () => navigator.clipboard.writeText(lost.value)

let channel: ReturnType<typeof supabase.channel> | null = null
let retry: ReturnType<typeof setInterval>
const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
onMounted(async () => {
  await loadMotions()
  await load()
  channel = supabase.channel(`rapp-${sid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_documents', filter: `session_id=eq.${sid}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_motions', filter: `session_id=eq.${sid}` }, loadMotions)
    .subscribe()
  retry = setInterval(() => { if (dirty) save(); else if (!loaded.value) load() }, 4000)
  window.addEventListener('beforeunload', warn)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(retry)
  window.removeEventListener('beforeunload', warn)
  if (channel) supabase.removeChannel(channel)
  // Last chance; the draft stays on this device if it does not get through.
  if (dirty) supabase.rpc('cmd_save_document', { p_session: sid, p_content: current() }).then(({ error: e }) => { if (!e) writeDraft(null) })
  editor.destroy()
})

// Level 2 is reserved for the automatic motion headings.
const chain = () => editor.chain().focus()
const tools: { label: string; name: string; attrs?: { level: 1 | 3 }; run: () => void }[] = [
  { label: 'rapp.heading', name: 'heading', attrs: { level: 1 }, run: () => chain().toggleHeading({ level: 1 }).run() },
  { label: 'rapp.subheading', name: 'heading', attrs: { level: 3 }, run: () => chain().toggleHeading({ level: 3 }).run() },
  { label: 'rapp.bold', name: 'bold', run: () => chain().toggleBold().run() },
  { label: 'rapp.italic', name: 'italic', run: () => chain().toggleItalic().run() },
  { label: 'rapp.underline', name: 'underline', run: () => chain().toggleUnderline().run() },
  { label: 'rapp.mark', name: 'highlight', run: () => chain().toggleHighlight().run() },
  { label: 'rapp.list', name: 'bulletList', run: () => chain().toggleBulletList().run() },
  { label: 'rapp.numbered', name: 'orderedList', run: () => chain().toggleOrderedList().run() },
  { label: 'rapp.quote', name: 'blockquote', run: () => chain().toggleBlockquote().run() },
  { label: 'rapp.divider', name: 'horizontalRule', run: () => chain().setHorizontalRule().run() },
  { label: 'rapp.undo', name: 'undo', run: () => chain().undo().run() },
  { label: 'rapp.redo', name: 'redo', run: () => chain().redo().run() },
]
// Re-render the toolbar as the selection moves.
const tick = ref(0)
editor.on('transaction', () => tick.value++)
const isOn = (x: (typeof tools)[number]) => tick.value >= 0 && editor.isActive(x.name, x.attrs)
</script>

<template>
  <div class="rdoc">
    <div v-if="loaded" class="writer">
      <template v-if="mine">
        <strong>{{ t('rapp.youWrite') }}</strong>
        <span class="muted" role="status">{{ t(`rapp.${state}`) }}</span>
      </template>
      <template v-else-if="row?.writer_id">
        <span role="status">{{ t('rapp.writing', { name: row.writer_name || t('rapp.someone') }) }}</span>
        <button type="button" class="ghost" @click="claim(true)">{{ t('rapp.takeOver') }}</button>
      </template>
      <button v-else type="button" class="btn" @click="claim(false)">{{ t('rapp.start') }}</button>
    </div>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <p v-if="lost" class="err" role="alert">
      {{ t('rapp.lost') }} <button type="button" class="ghost" @click="copyLost">{{ t('rapp.copy') }}</button>
    </p>

    <div v-if="mine" class="toolbar" role="toolbar">
      <button v-for="x in tools" :key="x.label" type="button" class="ghost" :aria-pressed="isOn(x)" @mousedown.prevent="x.run()">{{ t(x.label) }}</button>
    </div>
    <EditorContent :editor="editor" class="page" />
  </div>
</template>

<style scoped>
.writer { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 10px }
.toolbar { position: sticky; top: 84px; z-index: 4; display: flex; gap: 6px; flex-wrap: wrap; padding: 8px; margin-bottom: 8px; background: var(--white); border: 1px solid var(--divider); border-radius: 12px }
.ghost { font: inherit; font-size: 14px; color: inherit; background: var(--white); border: 1px solid var(--divider); border-radius: 8px; padding: 6px 12px; cursor: pointer }
.ghost[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent) }
.page { background: var(--white); border: 1px solid var(--divider); border-radius: 14px }
.page :deep(.doc) { min-height: 55vh; padding: 28px 32px; outline: none; line-height: 1.6; overflow-wrap: anywhere }
.page :deep(.doc > *:first-child) { margin-top: 0 }
.page :deep(.doc p) { margin: 0 0 .5em }
.page :deep(.doc h2) { font-size: 1.05rem; margin: 1.4em 0 .5em; border-left: 3px solid var(--accent); padding-left: 10px }
.page :deep(.doc h1) { font-size: 1.7rem; line-height: 1.25; margin: 1.2em 0 .5em }
.page :deep(.doc h3) { font-size: 1.3rem; line-height: 1.3; margin: 1em 0 .4em }
.page :deep(.doc ul) { list-style: disc; padding-left: 1.4em }
.page :deep(.doc ol) { list-style: decimal; padding-left: 1.4em }
.page :deep(.doc blockquote) { margin: .6em 0; padding-left: 12px; border-left: 3px solid var(--divider); color: var(--text-muted) }
.page :deep(.doc hr) { border: 0; border-top: 1px solid var(--divider); margin: 1em 0 }
.page :deep(.mention) { font-weight: 700 }
.page :deep(mark) { background: #ffe66d; color: #1b1b1b; border-radius: 3px }
@media (max-width: 560px) { .page :deep(.doc) { padding: 18px 16px } }
</style>

<style>
/* Mounted on <body> by the suggestion plugin, so not scoped. */
.mention-menu { z-index: 30; display: grid; min-width: 220px; padding: 4px; background: var(--white); border: 1px solid var(--divider); border-radius: 10px; box-shadow: var(--shadow-lg) }
.mention-menu[hidden] { display: none }
.mention-menu button { font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 8px; padding: 8px 10px; cursor: pointer }
.mention-menu button[aria-selected='true'] { background: var(--accent-soft) }
</style>
