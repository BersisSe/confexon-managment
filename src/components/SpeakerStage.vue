<script setup lang="ts">
import CountryFlag from '@/components/CountryFlag.vue'
import { Settings, SkipBack, RotateCcw, Play, Pause } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTimeAlert } from '@/lib/alerts'

// Board-friendly speaker view: who speaks now, the clock, and who is next.
const props = withDefaults(defineProps<{
  current: string | null
  clock: string
  total: string
  remainingMs: number
  totalMs: number
  running: boolean
  next: string[]
  showNext?: boolean
  canSettings?: boolean
  settingsOpen?: boolean
  canYield?: boolean
  yieldedTo?: string | null
  yieldedFrom?: string | null
  doneLabel?: string
  canPrevious?: boolean
}>(), { showNext: true })
const emit = defineEmits<{ previous: []; play: []; reset: []; done: []; adjust: [seconds: number]; yield: []; 'update:settingsOpen': [open: boolean] }>()
const { t } = useI18n()

const up = computed(() => !!props.current && props.remainingMs <= 0)
useTimeAlert(toRef(props, 'remainingMs'), toRef(props, 'running'), computed(() => !!props.current))

// Settings popover: closes on outside click and Esc.
const wrap = ref<HTMLElement | null>(null)
const close = () => emit('update:settingsOpen', false)
function onDown(e: PointerEvent) {
  if (wrap.value && !wrap.value.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
function unlisten() {
  document.removeEventListener('pointerdown', onDown)
  document.removeEventListener('keydown', onKey)
}
watch(() => props.settingsOpen, (open) => {
  unlisten()
  if (open) {
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
  }
}, { immediate: true })
onBeforeUnmount(unlisten)

// Share of the speaking time still left, drives the bar.
const share = computed(() => (props.current && props.totalMs > 0 ? Math.min(1, Math.max(0, props.remainingMs / props.totalMs)) : 0))

// A key press lights up its button the same way a click does.
const hit = ref('')
let hitTimer: ReturnType<typeof setTimeout>
function flashKey(code: string) {
  clearTimeout(hitTimer)
  hit.value = code
  hitTimer = setTimeout(() => (hit.value = ''), 130)
}
onBeforeUnmount(() => clearTimeout(hitTimer))

// Keyboard shortcuts. Only one stage is mounted at a time, so a document listener is safe.
// Space always means play/pause (Enter still presses a focused button).
function onShortcut(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || props.settingsOpen || document.querySelector('[aria-modal="true"]')) return
  if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
  // "Previous" also works after the list ran out; everything else needs a speaker.
  if (e.code === 'KeyP' && props.canPrevious) {
    e.preventDefault()
    if (!e.repeat) { flashKey(e.code); emit('previous') }
    return
  }
  if (!props.current) return
  const actions: Record<string, () => void> = {
    Space: () => emit('play'),
    ArrowLeft: () => emit('adjust', -15),
    ArrowRight: () => emit('adjust', 15),
    KeyR: () => emit('reset'),
    KeyN: () => emit('done'),
  }
  if (props.canYield && !props.yieldedFrom) actions.KeyD = () => emit('yield')
  const run = actions[e.code]
  if (!run) return
  e.preventDefault()
  if (!e.repeat) { flashKey(e.code); run() }
}
// Firefox clicks a focused button on Space keyup, which would fire a second action.
function onSpaceUp(e: KeyboardEvent) {
  if (e.code === 'Space' && props.current && !document.querySelector('[aria-modal="true"]') && (e.target as HTMLElement).closest?.('button')) e.preventDefault()
}
onMounted(() => {
  document.addEventListener('keydown', onShortcut)
  document.addEventListener('keyup', onSpaceUp)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onShortcut)
  document.removeEventListener('keyup', onSpaceUp)
})

const first = computed(() => props.next[0] ?? null)
const rest = computed(() => props.next.slice(1, 9))
const more = computed(() => Math.max(0, props.next.length - 9))
</script>

<template>
  <div class="stage" :class="{ solo: showNext === false }">
    <div class="now" :class="{ up }">
      <div v-if="canSettings" ref="wrap" class="gearwrap">
        <button
          class="gear" :class="{ on: settingsOpen }" :aria-expanded="!!settingsOpen" aria-haspopup="dialog"
          :aria-label="t('session.speakingTime')" :title="t('session.speakingTime')"
          @click="emit('update:settingsOpen', !settingsOpen)"
        ><Settings :size="18" /></button>
        <Transition name="pop">
          <div v-if="settingsOpen" class="pop" role="dialog" :aria-label="t('session.speakingTime')">
            <slot name="settings" :close="close" />
          </div>
        </Transition>
      </div>
      <span class="lbl">{{ t('session.currentSpeaker') }}</span>
      <div :key="current ?? ''" class="who rise" :class="{ none: !current }"><CountryFlag :name="current" />{{ current ?? t('session.nobodyShort') }}</div>
      <p v-if="yieldedFrom" class="tagline">{{ t('session.yieldedFrom', { c: yieldedFrom }) }}</p>
      <p v-else-if="yieldedTo === 'questions'" class="tagline q">{{ t('session.yieldQuestions') }}</p>
      <!-- Decorative: the clock below says the same in text. -->
      <div class="timebar" :class="{ low: remainingMs <= 10000 }" aria-hidden="true"><i :style="{ transform: `scaleX(${share})` }" /></div>
      <div class="clock" role="timer" aria-live="off">{{ clock }}<span> / {{ total }}</span></div>
      <div class="ctrl">
        <div class="row">
          <button class="adj" :class="{ hit: hit === 'ArrowLeft' }" :disabled="!current" :aria-label="t('session.minus15')" aria-keyshortcuts="ArrowLeft" @click="emit('adjust', -15)">−15<kbd>←</kbd></button>
          <button class="go" :class="{ hit: hit === 'Space' }" :disabled="!current" :aria-label="t('session.playPause')" aria-keyshortcuts="Space" @click="emit('play')"><Pause v-if="running" :size="28" fill="currentColor" /><Play v-else :size="28" fill="currentColor" /><kbd>Space</kbd></button>
          <button class="adj" :class="{ hit: hit === 'ArrowRight' }" :disabled="!current" :aria-label="t('session.plus15')" aria-keyshortcuts="ArrowRight" @click="emit('adjust', 15)">+15<kbd>→</kbd></button>
        </div>
        <div class="row">
          <button :disabled="!canPrevious" aria-keyshortcuts="P" :class="{ hit: hit === 'KeyP' }" @click="emit('previous')"><SkipBack :size="18" />{{ t('session.previous') }}<kbd>P</kbd></button>
          <button :disabled="!current" aria-keyshortcuts="R" :class="{ hit: hit === 'KeyR' }" @click="emit('reset')"><RotateCcw :size="18" />{{ t('session.reset') }}<kbd>R</kbd></button>
          <button v-if="canYield" :disabled="!current || !!yieldedFrom" :title="yieldedFrom ? t('session.noReYield') : ''" aria-keyshortcuts="D" :class="{ hit: hit === 'KeyD' }" @click="emit('yield')">{{ t('session.yield') }}<kbd>D</kbd></button>
          <button class="done" :class="{ hit: hit === 'KeyN' }" :disabled="!current" aria-keyshortcuts="N" @click="emit('done')">{{ doneLabel ?? t('session.next') }}<kbd>N</kbd></button>
        </div>
      </div>
    </div>

    <aside v-if="showNext !== false" class="next">
      <span class="lbl">{{ t('session.upNext') }}</span>
      <div v-if="first" :key="first" class="n1 rise"><CountryFlag :name="first" />{{ first }}</div>
      <p v-else class="muted">{{ t('session.nobodyNext') }}</p>
      <ol v-if="rest.length" class="chips" start="2">
        <li v-for="(c, i) in rest" :key="i + c" class="rise"><CountryFlag :name="c" />{{ c }}</li>
        <li v-if="more" class="more">+{{ more }}</li>
      </ol>
    </aside>
  </div>
</template>

<style scoped>
.stage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 300px); gap: 18px }
.stage.solo { grid-template-columns: 1fr }
.now, .next { background: var(--white); border: 1px solid var(--divider); border-radius: 22px; padding: clamp(12px, 2vh, 26px); box-shadow: var(--shadow-sm) }
.now { text-align: center; position: relative }
.gearwrap { position: absolute; top: 14px; right: 14px; z-index: 30; text-align: left }
.gear { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--divider); background: var(--white); font-size: 18px; color: var(--text-muted); cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease, transform .25s var(--ease-out) }
.gear:hover { background: var(--cream-deep); color: var(--text) }
.gear.on { background: var(--accent-soft); color: var(--accent-dark); border-color: transparent; transform: rotate(60deg) }
.pop { position: absolute; top: calc(100% + 10px); right: 0; width: 300px; max-width: calc(100vw - 48px); background: var(--white); border: 1px solid var(--divider); border-radius: 18px; padding: 18px; box-shadow: var(--shadow-lg); transform-origin: top right }
.pop::before { content: ''; position: absolute; top: -7px; right: 15px; width: 12px; height: 12px; background: var(--white); border-left: 1px solid var(--divider); border-top: 1px solid var(--divider); transform: rotate(45deg) }
.pop-enter-active, .pop-leave-active { transition: opacity .16s ease, transform .18s var(--ease-out) }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px) scale(.96) }
@media (prefers-reduced-motion: reduce) { .pop-enter-active, .pop-leave-active { transition: none } .gear.on { transform: none } }
.now.up { animation: flash 1s ease-in-out infinite; border-color: var(--danger) }
@keyframes flash { 50% { box-shadow: 0 0 0 8px rgb(163 50 39 / .22) } }
@media (prefers-reduced-motion: reduce) { .now.up { animation: none; box-shadow: 0 0 0 6px rgb(163 50 39 / .22) } }
.lbl { display: block; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-tertiary); font-weight: 700 }
.who { font-family: var(--font-display); font-weight: 700; line-height: 1.05; font-size: clamp(1.8rem, min(6.5vw, 7.5vh), 5rem); margin: 6px 0 0; overflow-wrap: anywhere }
/* Current speaker: flag on top, name below. cover crops the PNG's blank top/bottom. */
.who .flag { display: block; width: 1.9em; height: 1.27em; object-fit: cover; margin: 0 auto .16em }
.who.none { color: var(--text-tertiary); font-size: clamp(1.6rem, 4vw, 2.6rem) }
.tagline { margin: 6px 0 0; font-weight: 700; color: var(--info) }
.tagline.q { color: var(--accent-dark) }
.timebar { height: 12px; max-width: 560px; margin: clamp(8px, 1.5vh, 18px) auto 0; border-radius: 999px; background: var(--cream-deep); overflow: hidden }
.timebar i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform .25s linear }
.timebar.low i { background: var(--danger) }
@media (prefers-reduced-motion: reduce) { .timebar i { transition: none } }
.clock { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; font-size: clamp(2.8rem, min(10vw, 12vh), 8rem); line-height: 1.05; padding: 4px 0 8px }
.clock span { color: var(--text-tertiary); font-size: .4em }
.now.up .clock { color: var(--danger) }
.ctrl { display: grid; gap: clamp(8px, 1.4vh, 14px); margin-top: 2px }
.ctrl .row { display: flex; justify-content: center; gap: 18px; flex-wrap: wrap }
.ctrl button { transition: scale .08s ease, background var(--dur-fast) ease; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: clamp(40px, 5.6vh, 52px); padding: 0 20px; border-radius: 999px; border: 1px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-size: 16px; font-weight: 700; cursor: pointer }
.ctrl button:hover:not(:disabled) { background: var(--cream-deep) }
.ctrl .adj { min-width: 120px; min-height: clamp(46px, 7vh, 64px); font-size: 20px }
.ctrl .go { min-width: 168px; min-height: clamp(46px, 7vh, 64px); background: var(--accent); color: #fff; border-color: var(--accent) }
.ctrl .go:hover:not(:disabled) { background: var(--accent-hover) }
.ctrl .done { min-width: 168px; background: var(--cream-deep) }
.ctrl button:disabled { opacity: .4; cursor: default }
.ctrl kbd { font: inherit; font-size: 11px; font-weight: 700; line-height: 1; padding: 4px 6px; border-radius: 6px; border: 1px solid currentColor; opacity: .55 }
@media (hover: none) { .ctrl kbd { display: none } }
@media (max-width: 560px) { .ctrl .row { gap: 8px } .ctrl .adj, .ctrl .go, .ctrl .done { min-width: 0 } .ctrl button { padding: 0 14px } }
.next { background: var(--accent-soft); border-color: transparent; padding: 20px; display: grid; align-content: start; gap: 10px }
.n1 { font-family: var(--font-display); font-weight: 700; font-size: clamp(1.3rem, 2.2vw, 1.9rem); line-height: 1.1; color: var(--accent-dark); overflow-wrap: anywhere }
.chips { list-style: decimal; padding-left: 28px; margin: 10px 0 0; display: grid; gap: 6px; font-size: clamp(.95rem, 1.3vw, 1.15rem); font-weight: 600 }
.chips .more { list-style: none; color: var(--text-tertiary); margin-left: -28px }
@media (max-width: 900px) { .stage { grid-template-columns: 1fr } }
</style>
