import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/components/AppShell.vue'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  {
    path: '/', component: AppShell, children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
      { path: 'courses', name: 'courses', component: () => import('@/pages/CourseListPage.vue') },
      { path: 'courses/new', name: 'course-new', component: () => import('@/pages/CourseCreatePage.vue'), meta: { roles: ['owner', 'manager'] } },
      { path: 'courses/:courseId', name: 'course-detail', component: () => import('@/pages/CourseDetailPage.vue') },
      { path: 'courses/:courseId/enroll', name: 'course-enroll', component: () => import('@/pages/ParticipantEnrollPage.vue'), meta: { roles: ['owner', 'manager', 'front_desk'] } },
      { path: 'sessions/:sessionId/attendance', name: 'attendance', component: () => import('@/pages/AttendancePage.vue') },
      { path: 'lane-plan', name: 'lane-plan', component: () => import('@/pages/LanePlanPage.vue') },
      { path: 'pool-checks', name: 'pool-checks', component: () => import('@/pages/PoolChecksPage.vue'), meta: { roles: ['owner', 'manager', 'front_desk'] } },
      { path: 'instructor', name: 'instructor', component: () => import('@/pages/InstructorPage.vue'), meta: { roles: ['owner', 'manager', 'trainer'] } },
      { path: 'memberships', name: 'memberships', component: () => import('@/pages/MembershipsPage.vue'), meta: { roles: ['owner', 'manager', 'front_desk'] } },
      { path: 'membership-plans', name: 'membership-plans', component: () => import('@/pages/MembershipPlanSettingsPage.vue'), meta: { roles: ['owner', 'manager'] } },
      { path: 'members/:participantId', name: 'member-detail', component: () => import('@/pages/MemberDetailPage.vue'), meta: { roles: ['owner', 'manager', 'front_desk'] } },
      { path: 'participants', name: 'participants', component: () => import('@/pages/ParticipantsPage.vue'), meta: { roles: ['owner', 'manager', 'front_desk'] } },
      { path: 'payments', name: 'payments', component: () => import('@/pages/PaymentsPage.vue'), meta: { roles: ['owner', 'manager', 'front_desk'] } },
      { path: 'settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.checked) await auth.restore()
  if (to.meta.public) return auth.user ? '/dashboard' : true
  if (!auth.user) return { name: 'login', query: { redirect: to.fullPath } }
  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(auth.user.role)) return '/dashboard'
  return true
})

router.afterEach((to) => {
  const label = typeof to.name === 'string' ? to.name : 'uygulama'
  document.title = `${label.replaceAll('-', ' ')} · Emniyet Spor Salonu`
  window.scrollTo({ top: 0 })
})
