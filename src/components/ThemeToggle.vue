<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { dark, toggleTheme } from '@/lib/theme'

const { t } = useI18n()
</script>

<template>
  <button class="lang" type="button" :aria-label="t(dark ? 'theme.light' : 'theme.dark')" :title="t(dark ? 'theme.light' : 'theme.dark')" @click="toggleTheme">
    <Sun v-if="dark" :size="16" /><Moon v-else :size="16" />
  </button>
</template>
