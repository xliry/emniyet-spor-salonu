import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '@/lib/api'
import type { User } from '@/lib/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const checked = ref(false)
  const loading = ref(false)

  const isManager = computed(() => user.value?.role === 'owner' || user.value?.role === 'manager')

  async function restore() {
    if (checked.value) return user.value
    try {
      const response = await apiFetch<{ user: User }>('/auth/me')
      user.value = response.user
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
    return user.value
  }

  async function login(email: string, password: string) {
    loading.value = true
    try {
      const response = await apiFetch<{ user: User }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      })
      user.value = response.user
      checked.value = true
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await apiFetch<void>('/auth/logout', { method: 'POST' })
    user.value = null
    checked.value = true
  }

  return { user, checked, loading, isManager, restore, login, logout }
})

