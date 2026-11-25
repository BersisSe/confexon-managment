import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './assets/css/tokens.css'
import './assets/css/console.css'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'

document.documentElement.lang = i18n.global.locale.value

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
