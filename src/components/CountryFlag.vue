<script setup lang="ts">
import { computed, ref } from 'vue'
import { countryCode } from '@/lib/countryCode'

const props = defineProps<{ name: string | null | undefined }>()
const src = computed(() => {
  const code = props.name ? countryCode(props.name) : null
  return code ? `https://flagsapi.com/${code}/flat/64.png` : null
})
// Remember which URL failed, so a new name gets a fresh try.
const failed = ref<string | null>(null)
</script>

<template>
  <!-- Decorative: the country name is always next to it. -->
  <img v-if="src && src !== failed" class="flag" :src="src" alt="" width="64" height="64" @error="failed = src" />
</template>

<style scoped>
.flag { display: inline-block; width: 1.5em; height: 1.5em; margin-right: .3em; vertical-align: -.4em; object-fit: contain }
</style>
