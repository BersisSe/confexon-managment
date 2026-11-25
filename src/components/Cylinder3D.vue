<script setup lang="ts">
// A cylinder made of flat strips, lying along the X axis, centred on its parent's origin.
import { computed } from 'vue'

const props = defineProps<{ length: number; radius: number; bands?: boolean }>()
const N = 24
const faces = computed(() => {
  const h = 2 * props.radius * Math.tan(Math.PI / N) + 1
  return Array.from({ length: N }, (_, i) => {
    const a = (360 / N) * i
    // Fake a light from above and in front.
    const light = 24 + 20 * Math.max(0, Math.cos(((a - 45) * Math.PI) / 180))
    const wood = `hsl(20 58% ${light}%)`
    const gold = `hsl(41 70% ${light + 24}%)`
    return {
      width: `${props.length}px`, height: `${h}px`, left: `${-props.length / 2}px`, top: `${-h / 2}px`,
      background: props.bands
        ? `linear-gradient(90deg, ${wood} 0 12%, ${gold} 12% 20%, ${wood} 20% 80%, ${gold} 80% 88%, ${wood} 88%)`
        : wood,
      transform: `rotateX(${a}deg) translateZ(${props.radius}px)`,
    }
  })
})
const caps = computed(() => [-1, 1].map((side) => ({
  width: `${props.radius * 2}px`, height: `${props.radius * 2}px`, left: `${-props.radius}px`, top: `${-props.radius}px`,
  transform: `translateX(${(side * props.length) / 2}px) rotateY(90deg)`,
})))
</script>

<template>
  <div class="cy">
    <i v-for="(f, i) in faces" :key="i" :style="f" />
    <i v-for="(c, i) in caps" :key="'c' + i" class="cap" :style="c" />
  </div>
</template>

<style scoped>
.cy { position: absolute; transform-style: preserve-3d }
.cy i { position: absolute; display: block }
.cy .cap { border-radius: 50%; background: radial-gradient(circle, hsl(24 52% 42%) 0 22%, hsl(20 55% 30%) 23% 48%, hsl(24 52% 38%) 49% 62%, hsl(19 58% 26%) 63%) }
</style>
