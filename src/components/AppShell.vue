<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarDays, ChevronLeft, ClipboardCheck, CreditCard, Dumbbell, LayoutDashboard,
  LogOut, Menu, Search, Settings, Users, Waves, X,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import InitialsAvatar from './InitialsAvatar.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const mobileOpen = ref(false)
const query = ref('')

const navItems = computed(() => [
  { to: '/dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
  { to: '/courses', label: 'Kurslar ve Havuz', icon: Waves },
  { to: '/lane-plan', label: 'Takvim', icon: CalendarDays },
  ...(auth.user?.role === 'trainer' ? [] : [
    { to: '/memberships', label: 'Üyeler', icon: Users },
    { to: '/payments', label: 'Tahsilatlar', icon: CreditCard },
  ]),
  ...(auth.user?.role === 'trainer' ? [] : [{ to: '/pool-checks', label: 'Havuz Kontrolleri', icon: ClipboardCheck }]),
  ...(auth.user?.role === 'trainer' ? [] : [{ to: '/participants', label: 'Kursiyerler', icon: Dumbbell }]),
  { to: '/settings', label: 'Ayarlar', icon: Settings },
])

const isActive = (path: string) => path === '/courses'
  ? route.path.startsWith('/courses') || route.path.startsWith('/sessions')
  : route.path === path

function submitSearch() {
  if (!query.value.trim()) return
  router.push({ path: '/memberships', query: { query: query.value.trim() } })
  query.value = ''
}

async function logout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <a class="skip-link" href="#main-content">Ana içeriğe geç</a>
  <div class="app-shell">
    <div v-if="mobileOpen" class="sidebar-backdrop" @click="mobileOpen = false" />
    <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }" aria-label="Ana navigasyon">
      <div class="brand">
        <div class="brand__mark"><Waves :size="24" /></div>
        <div><strong>Emniyet Spor Salonu</strong><span>Operasyon Paneli</span></div>
        <button class="icon-button sidebar__close" type="button" aria-label="Menüyü kapat" @click="mobileOpen = false"><X :size="20" /></button>
      </div>
      <nav class="sidebar__nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item--active': isActive(item.to) }" @click="mobileOpen = false">
          <component :is="item.icon" :size="20" /><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <RouterLink v-if="auth.user?.role === 'trainer'" class="sidebar__instructor" to="/instructor">
        <CalendarDays :size="18" /><span>Eğitmen Çalışma Alanı</span><ChevronLeft class="rotate-180" :size="16" />
      </RouterLink>
      <div v-if="auth.user" class="sidebar__account">
        <InitialsAvatar :name="auth.user.fullName" size="sm" />
        <div><strong>{{ auth.user.fullName }}</strong><span>{{ { owner: 'İşletme Sahibi', manager: 'Operasyon Yöneticisi', front_desk: 'Resepsiyon', trainer: 'Eğitmen' }[auth.user.role] }}</span></div>
        <button class="icon-button icon-button--inverse" type="button" aria-label="Oturumu kapat" @click="logout"><LogOut :size="18" /></button>
      </div>
      <p class="provider">Zenit tarafından sağlanmaktadır</p>
    </aside>
    <div class="app-shell__body">
      <header class="topbar">
        <button class="icon-button topbar__menu" type="button" aria-label="Menüyü aç" @click="mobileOpen = true"><Menu :size="22" /></button>
        <form class="topbar__search" role="search" @submit.prevent="submitSearch">
          <Search :size="18" /><label class="sr-only" for="global-search">Kursiyer ara</label>
          <input id="global-search" v-model="query" type="search" placeholder="Kursiyer ara…" />
        </form>
        <div class="topbar__context"><span class="status-dot" />Tesis aktif</div>
      </header>
      <main id="main-content" class="page" tabindex="-1"><RouterView /></main>
    </div>
  </div>
</template>
