<script setup lang="ts">
// Entering a committee: a 3D gavel comes down on its sound block.
import gsap from 'gsap'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Cylinder3D from './Cylinder3D.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ done: [] }>()

// The part of the 520x360 stage the gavel really uses (raised and resting).
const BOX = { x: 80, y: -90, w: 350, h: 410 }
const k = ref(1)
function fit() {
  k.value = Math.min((innerWidth * 0.92) / BOX.w, (innerHeight - 170) / BOX.h, 2.4)
}
fit()

const root = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null
let finished = false
function finish() {
  if (finished) return
  finished = true
  emit('done')
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }

onMounted(() => {
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', fit)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish()
  ctx = gsap.context(() => {
    gsap.set('.gv-arm', { rotation: 28 })
    gsap.set('.gv-ring', { xPercent: -50, yPercent: -50, rotationX: 72, scale: 0.3, opacity: 0 })
    // The frame leaves headroom for the raised gavel; once it is down, move up to centre it.
    const lift = -80 * k.value
    gsap.set('.gv-title', { opacity: 0, y: 24 })
    const hit = (tl: gsap.core.Timeline) => tl
      .to('.gv-arm', { rotation: 0, duration: 0.16, ease: 'power4.in' })
      .fromTo('.gv-ring', { scale: 0.3, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false })
      .fromTo('.gv-scene', { y: 14 }, { y: 0, duration: 0.35, ease: 'elastic.out(1.4, 0.3)', immediateRender: false }, '<')
    const tl = gsap.timeline({ onComplete: finish })
    tl.from(root.value, { opacity: 0, duration: 0.2 })
      .from('.gv-scene', { scale: 0.8, y: 50, duration: 0.35, ease: 'back.out(1.6)' }, '<')
      .to('.gv-arm', { rotation: 58, duration: 0.34, ease: 'power2.out' })
    hit(tl)
    tl.to('.gv-arm', { rotation: 30, duration: 0.18, ease: 'power2.out' }, '-=0.35')
      .to('.gv-frame', { y: lift, duration: 0.34, ease: 'power2.inOut' }, '<')
    hit(tl)
    tl.to('.gv-title', { opacity: 1, y: lift, duration: 0.3, ease: 'power2.out' }, '-=0.45')
      .to(root.value, { opacity: 0, duration: 0.22 }, '+=0.8')
  }, root.value!)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', fit)
  ctx?.revert()
})
</script>

<template>
  <Teleport to="body">
    <!-- Click or Esc skips it. -->
    <div ref="root" class="gv" role="status" @click="finish">
      <div class="gv-frame" aria-hidden="true" :style="{ width: `${BOX.w * k}px`, height: `${BOX.h * k}px` }">
      <div class="gv-stage" :style="{ transform: `scale(${k}) translate(${-BOX.x}px, ${-BOX.y}px)` }">
        <div class="gv-scene">
          <div class="gv-world">
            <div class="gv-block"><Cylinder3D :length="36" :radius="82" /></div>
            <i class="gv-ring" />
            <div class="gv-arm">
              <div class="gv-handle"><Cylinder3D :length="250" :radius="13" /></div>
              <div class="gv-knob"><Cylinder3D :length="34" :radius="19" bands /></div>
              <div class="gv-head"><Cylinder3D :length="150" :radius="46" bands /></div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <div class="gv-title">
        <strong>{{ title }}</strong>
        <!-- MUN term, same in both languages. -->
        <span lang="en">Official Session Start</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gv { position: fixed; inset: 0; z-index: 100; display: grid; place-content: center; justify-items: center; gap: 8px; overflow: hidden; cursor: pointer; background: radial-gradient(circle at 50% 45%, rgb(58 34 22 / .96), rgb(12 9 8 / .97) 70%) }
.gv-frame { position: relative }
.gv-stage { position: absolute; left: 0; top: 0; width: 520px; height: 360px; perspective: 1100px; transform-origin: 0 0 }
.gv-scene, .gv-world, .gv-arm, .gv-block, .gv-handle, .gv-knob, .gv-head { transform-style: preserve-3d }
.gv-scene, .gv-world { position: absolute; inset: 0 }
.gv-world { transform: rotateX(-16deg) rotateY(-22deg) }
/* The arm turns around the grip end of the handle. */
.gv-arm { position: absolute; left: 400px; top: 205px; width: 0; height: 0 }
.gv-handle, .gv-knob, .gv-head, .gv-block { position: absolute }
.gv-handle { left: -125px }
.gv-knob { left: 8px }
.gv-head { left: -250px; transform: rotateZ(90deg) }
.gv-block { left: 150px; top: 298px; transform: rotateZ(90deg) }
.gv-ring { position: absolute; left: 150px; top: 280px; width: 180px; height: 180px; border-radius: 50%; border: 4px solid #f2a272 }
.gv-title { display: grid; justify-items: center; gap: 6px; max-width: 90vw; text-align: center; line-height: 1.15 }
.gv-title strong { font-family: var(--font-display); font-size: clamp(2rem, 6vw, 4rem); color: #fbeee5 }
.gv-title span { font-size: clamp(.9rem, 2.2vw, 1.4rem); font-weight: 700; letter-spacing: .28em; text-transform: uppercase; color: #f2a272 }
</style>
