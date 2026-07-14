<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { CalendarDays, LayoutGrid, List, Plus, Search, Users, Waves } from 'lucide-vue-next'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch, money } from '@/lib/api'
import type { CourseListResponse } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'

const response = ref<CourseListResponse | null>(null)
const auth = useAuthStore()
const loading = ref(true)
const error = ref('')
const view = ref<'table' | 'cards'>('table')
const filters = reactive({ query: '', termId: '', ageGroup: '', level: '', instructorId: '', dayOfWeek: '', occupancy: '', status: '' })
let debounce: ReturnType<typeof globalThis.setTimeout>

const statusTone = (status: string) => status === 'active' ? 'success' : status === 'cancelled' ? 'danger' : status === 'draft' ? 'neutral' : 'warning'
const statusLabel = (status: string) => ({ active: 'Aktif', cancelled: 'İptal', draft: 'Taslak', upcoming: 'Yakında' }[status] || status)

async function load() {
  loading.value = true; error.value = ''
  const params = new globalThis.URLSearchParams({ page: '1', pageSize: '30' })
  Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
  try { response.value = await apiFetch<CourseListResponse>(`/courses?${params}`) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Kurslar alınamadı.' }
  finally { loading.value = false }
}
watch(filters, () => { globalThis.clearTimeout(debounce); debounce = globalThis.setTimeout(load, 300) })
onMounted(load)
</script>

<template>
  <div class="page-header"><div><p class="eyebrow">Kurs yönetimi</p><h1>Kurslar ve Havuz</h1><p>Kursları filtreleyin, dolulukları izleyin ve operasyon akışlarını açın.</p></div><div class="page-actions"><div class="view-toggle" aria-label="Görünüm"><button :aria-pressed="view==='table'" @click="view='table'"><List :size="17" />Tablo</button><button :aria-pressed="view==='cards'" @click="view='cards'"><LayoutGrid :size="17" />Kartlar</button></div><RouterLink v-if="auth.isManager" class="button button--primary" to="/courses/new"><Plus :size="17" />Yeni Kurs</RouterLink></div></div>
  <section class="filters" aria-label="Kurs filtreleri">
    <label class="field"><span>Arama</span><div class="filter-search"><Search :size="16" /><input v-model="filters.query" type="search" placeholder="Kurs veya eğitmen" /></div></label>
    <label class="field"><span>Dönem</span><select v-model="filters.termId"><option value="">Tümü</option><option v-for="term in response?.filters?.terms || []" :key="term.id" :value="term.id">{{ term.name }}</option></select></label>
    <label class="field"><span>Yaş Grubu</span><select v-model="filters.ageGroup"><option value="">Tümü</option><option value="child">Çocuk</option><option value="adult">Yetişkin</option><option value="mixed">Karma</option></select></label>
    <label class="field"><span>Seviye</span><select v-model="filters.level"><option value="">Tümü</option><option value="beginner">Başlangıç</option><option value="intermediate">Orta</option><option value="advanced">İleri</option></select></label>
    <label class="field"><span>Eğitmen</span><select v-model="filters.instructorId"><option value="">Tümü</option><option v-for="person in response?.filters?.instructors || []" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
    <label class="field"><span>Gün</span><select v-model="filters.dayOfWeek"><option value="">Tümü</option><option v-for="(day,index) in ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar']" :key="day" :value="index+1">{{ day }}</option></select></label>
    <label class="field"><span>Doluluk</span><select v-model="filters.occupancy"><option value="">Tümü</option><option value="available">Müsait</option><option value="full">Dolu</option><option value="waitlist">Bekleme listeli</option></select></label>
    <label class="field"><span>Durum</span><select v-model="filters.status"><option value="">Tümü</option><option value="active">Aktif</option><option value="upcoming">Yakında</option><option value="draft">Taslak</option><option value="cancelled">İptal</option></select></label>
  </section>
  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error" state="error" :message="error" @retry="load" />
  <StatePanel v-else-if="!response?.items.length" state="empty" title="Kurs bulunamadı" message="Filtreleri temizleyin veya yeni bir kurs oluşturun." />
  <section v-else-if="view==='table'" class="card table-wrap"><table class="data-table"><thead><tr><th>Kurs</th><th>Eğitmen / Program</th><th>Kulvar</th><th>Doluluk</th><th>Ücret</th><th>Durum</th><th><span class="sr-only">İşlem</span></th></tr></thead><tbody><tr v-for="course in response.items" :key="course.id"><td><strong>{{ course.name }}</strong><small>{{ course.termName || course.category || '—' }}</small></td><td>{{ course.instructorName || 'Atanmadı' }}<small>{{ course.scheduleLabel || 'Program bekliyor' }}</small></td><td>{{ course.laneLabel || 'Atanmadı' }}</td><td><strong>{{ course.activeEnrollmentCount }}/{{ course.capacity }}</strong><small v-if="course.waitlistCount">{{ course.waitlistCount }} yedek</small></td><td>{{ money(course.feeAmountCents) }}</td><td><StatusBadge :tone="statusTone(course.status)" :label="statusLabel(course.status)" /></td><td><RouterLink class="button button--secondary" :to="`/courses/${course.id}`">Detay</RouterLink></td></tr></tbody></table></section>
  <section v-else class="course-cards"><article v-for="course in response?.items" :key="course.id" class="card course-card"><div class="course-card__top"><div><p class="eyebrow">{{ course.category || 'Yüzme Kursu' }}</p><h2>{{ course.name }}</h2></div><StatusBadge :tone="statusTone(course.status)" :label="statusLabel(course.status)" /></div><div class="course-card__facts"><span><Users :size="16" />{{ course.ageGroup || 'Tüm yaşlar' }} · {{ course.level || 'Seviye belirtilmedi' }}</span><span><CalendarDays :size="16" />{{ course.scheduleLabel || 'Program bekliyor' }}</span><span><Waves :size="16" />{{ course.laneLabel || 'Kulvar bekliyor' }}</span></div><div class="course-card__occupancy"><span>Doluluk</span><b>{{ course.activeEnrollmentCount }}/{{ course.capacity }}</b></div><div class="course-card__actions"><RouterLink class="button button--secondary" :to="`/courses/${course.id}`">Detaylar</RouterLink><RouterLink class="button button--primary" :to="`/courses/${course.id}/enroll`">Kursiyer Kaydet</RouterLink></div></article></section>
</template>

<style scoped>
.view-toggle{display:flex;border:1px solid #8fa3b7;border-radius:4px;overflow:hidden}.view-toggle button{display:flex;gap:6px;align-items:center;min-height:40px;padding:0 12px;border:0;border-right:1px solid #8fa3b7;background:white;color:#49607c;font-size:12px;font-weight:700}.view-toggle button:last-child{border:0}.view-toggle button[aria-pressed=true]{background:#d8eaff;color:#005087}.filter-search{display:flex;align-items:center;gap:6px;min-height:42px;padding:0 10px;background:white;border:1px solid #8fa3b7;border-radius:4px}.filter-search input{min-height:auto;padding:0;border:0;box-shadow:none}.data-table small{display:block;margin-top:4px;color:#5d6875;font-size:11px}.course-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.course-card{display:grid;gap:18px;padding:18px}.course-card__top{display:flex;justify-content:space-between;gap:12px}.course-card h2{margin:0;font-size:18px}.course-card__facts{display:grid;gap:9px;color:#425263;font-size:13px}.course-card__facts span{display:flex;align-items:center;gap:7px}.course-card__facts svg{color:#258bb5}.course-card__occupancy{display:flex;justify-content:space-between;padding:11px 12px;background:#edf4ff;border-left:3px solid #258bb5}.course-card__actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(max-width:1150px){.course-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.course-cards{grid-template-columns:1fr}.filters{grid-template-columns:1fr}.view-toggle{flex:1}.view-toggle button{flex:1;justify-content:center}}
</style>
