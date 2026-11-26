import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/', name: 'committees', component: () => import('@/views/CommitteesView.vue'), meta: { auth: true } },
    { path: '/management', name: 'management', component: () => import('@/views/ManagementView.vue'), meta: { auth: true } },
    { path: '/team', name: 'team', component: () => import('@/views/TeamView.vue'), meta: { auth: true } },
    { path: '/committee/:id/session', name: 'session', component: () => import('@/views/SessionView.vue'), meta: { auth: true } },
    { path: '/committee/:id/rapporteur', name: 'rapporteur', component: () => import('@/views/RapporteurView.vue'), meta: { auth: true } },
    { path: '/committee/:id', name: 'roster', component: () => import('@/views/RosterView.vue'), meta: { auth: true } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  if (!auth.ready) await auth.init()
  if (to.meta.auth && !auth.session) return { name: 'login' }
  if (to.name === 'login' && auth.session) return { name: 'committees' }
})

export default router
