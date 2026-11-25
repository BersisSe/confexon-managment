<script setup lang="ts">
// Number with big -/+ buttons and one-tap presets.
import { Minus, Plus } from 'lucide-vue-next'

const props = defineProps<{ modelValue: number; label: string; unit: string; hint: string; min: number; max: number; step: number; presets: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [n: number] }>()
const set = (n: number) => emit('update:modelValue', Math.min(props.max, Math.max(props.min, Math.round(n) || props.min)))
</script>

<template>
  <div class="ns" role="group" :aria-label="label">
    <div class="ns-head">
      <strong>{{ label }}</strong>
      <small>{{ hint }}</small>
    </div>
    <div class="ns-row">
      <button type="button" aria-label="−" :disabled="modelValue <= min" @click="set(modelValue - step)"><Minus :size="18" /></button>
      <input type="number" inputmode="numeric" :value="modelValue" :min="min" :max="max" :aria-label="label" @change="set(Number(($event.target as HTMLInputElement).value))" />
      <span class="ns-unit" aria-hidden="true">{{ unit }}</span>
      <button type="button" aria-label="+" :disabled="modelValue >= max" @click="set(modelValue + step)"><Plus :size="18" /></button>
    </div>
    <div class="ns-presets">
      <button v-for="p in presets" :key="p" type="button" :class="{ on: p === modelValue }" @click="set(p)">{{ p }} {{ unit }}</button>
    </div>
  </div>
</template>

<style scoped>
.ns { display: grid; gap: 12px; align-content: start; min-width: 0; padding: 16px; border-radius: 18px; background: var(--cream); border: 1px solid var(--divider) }
.ns-head { display: grid }
.ns-head small { color: var(--text-tertiary) }
.ns-unit { position: absolute; right: 68px; top: 50%; translate: 0 -50%; color: var(--text-tertiary); font-weight: 700; pointer-events: none }
.ns-row { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 8px }
.ns-row button { display: grid; place-items: center; height: 44px; border-radius: 50%; border: 1px solid var(--divider); background: var(--white); color: var(--text); cursor: pointer }
.ns-row button:disabled { opacity: .35; cursor: default }
.ns-row input { width: 100%; min-width: 0; text-align: center; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; appearance: textfield; border-radius: 999px }
.ns-row input::-webkit-inner-spin-button { appearance: none }
.ns-presets { display: flex; gap: 6px }
.ns-presets button { flex: 1; min-height: 32px; border-radius: 999px; border: 1px solid var(--divider); background: var(--white); color: var(--text-muted); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
.ns-presets button.on { background: var(--accent); border-color: var(--accent); color: #fff }
</style>
