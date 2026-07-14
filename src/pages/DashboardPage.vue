<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CalendarCheck, ClipboardCheck, CreditCard, Plus, TriangleAlert, Users, Waves } from 'lucide-vue-next'
import MetricCard from '@/components/MetricCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch, money, shortTime } from '@/lib/api'
import type { DashboardResponse } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'

const data = ref<DashboardResponse | null>(null)
const auth = useAuthStore()
const loading = ref(true)
const error = ref('')
const today = new Date().toISOString().slice(0, 10)

async function load() {
  loading.value = true; error.value = ''
  try { data.value = await apiFetch<DashboardResponse>(`/dashboard?date=${today}`) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Dashboard yüklenemedi.' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page-header"><div><p class="eyebrow">Operasyon merkezi</p><h1>Genel Bakış</h1><p>Bugünün havuz ve kurs operasyonlarını izleyin.</p></div><div class="page-actions"><RouterLink v-if="auth.user?.role !== 'trainer'" class="button button--secondary" to="/pool-checks"><ClipboardCheck :size="17" />Havuz Kontrolleri</RouterLink><RouterLink v-if="auth.isManager" class="button button--primary" to="/courses/new"><Plus :size="17" />Yeni Kurs</RouterLink></div></div>
  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error" state="error" :message="error" @retry="load" />
  <template v-else-if="data">
    <section class="facility-strip" aria-label="Tesis durumu"><div><span class="status-dot" /><strong>{{ data.poolStatus?.label || 'Kontrol bekliyor' }}</strong></div><span>Su sıcaklığı <b>{{ data.poolStatus?.temperature != null ? `${data.poolStatus.temperature} °C` : '—' }}</b></span><span>pH <b>{{ data.poolStatus?.ph ?? '—' }}</b></span><span>Son kontrol <b>{{ data.poolStatus?.lastCheckedAt ? shortTime(data.poolStatus.lastCheckedAt) : 'Henüz yok' }}</b></span></section>
    <section class="metrics-grid" aria-label="Temel göstergeler">
      <MetricCard label="Aktif kurslar" :value="data.activeCourseCount" detail="Devam eden kurslar" :icon="Waves" />
      <MetricCard label="Toplam kursiyer" :value="data.totalActiveParticipants" :detail="`${data.waitlistCount} kişi beklemede`" :icon="Users" />
      <MetricCard label="Bugünkü katılım" :value="`${data.todayRecordedAttendance}/${data.todayExpectedAttendance}`" detail="Kaydedilen / beklenen" :icon="CalendarCheck" />
      <MetricCard label="Açık bakiye" :value="money(data.outstandingBalanceCents)" detail="Manuel tahsilat bekliyor" :icon="CreditCard" :tone="data.outstandingBalanceCents > 0 ? 'danger' : 'default'" />
    </section>
    <div class="card-grid">
      <section class="card"><div class="card__header"><h2>Bugünkü Dersler</h2><RouterLink class="button button--ghost" to="/lane-plan">Takvimi aç</RouterLink></div><div v-if="data.sessions.length" class="session-list"><article v-for="session in data.sessions" :key="session.id" class="session-row"><div class="session-row__time"><strong>{{ shortTime(session.startsAt) }}</strong><span>{{ shortTime(session.endsAt) }}</span></div><div><strong>{{ session.courseName }}</strong><p>{{ session.laneName || 'Kulvar bekliyor' }} · {{ session.instructorName || 'Eğitmen bekliyor' }}</p></div><div class="session-row__attendance"><b>{{ session.recordedCount }}/{{ session.expectedCount }}</b><span>yoklama</span></div><RouterLink class="button button--secondary" :to="`/sessions/${session.id}/attendance`">Yoklama Al</RouterLink></article></div><StatePanel v-else state="empty" title="Bugün planlı ders yok" message="Bugün için oluşturulmuş aktif bir kurs seansı bulunmuyor." /></section>
      <aside class="stack">
        <section class="card card--accent"><div class="card__header"><h2>Kulvar Doluluğu</h2><StatusBadge tone="info" :label="`%${data.laneUtilizationPercent}`" /></div><div class="card__body utilization"><div class="utilization__bar"><span :style="{ width: `${Math.min(data.laneUtilizationPercent,100)}%` }" /></div><p class="muted">Seçili günün planlı kulvar kullanım oranı.</p><RouterLink class="button button--secondary button--block" to="/lane-plan">Kulvarları Planla</RouterLink></div></section>
        <section class="card"><div class="card__header"><h2>Son Operasyonlar</h2></div><div v-if="data.recentEvents.length" class="event-list"><div v-for="event in data.recentEvents" :key="event.id" class="event-row"><TriangleAlert :size="16" /><div><strong>{{ event.type }}</strong><p>{{ event.summary }}</p></div><time>{{ shortTime(event.occurredAt) }}</time></div></div><StatePanel v-else state="empty" title="Operasyon kaydı yok" message="Yetkiniz kapsamında görüntülenebilen yeni işlem bulunmuyor." /></section>
      </aside>
    </div>
  </template>
</template>

<style scoped>
.facility-strip{display:flex;align-items:center;gap:24px;min-height:50px;margin-bottom:16px;padding:10px 16px;background:#edf4ff;border:1px solid #c1c7d2;border-radius:6px;font-size:13px}.facility-strip>div{display:flex;align-items:center;gap:9px;margin-right:auto}.facility-strip span{color:#49607c}.facility-strip b{color:#051d2f}.session-list{display:grid}.session-row{display:grid;grid-template-columns:76px minmax(180px,1fr) auto auto;gap:16px;align-items:center;padding:16px 18px;border-bottom:1px solid #d8e2ee}.session-row:last-child{border-bottom:0}.session-row p{margin:4px 0 0;color:#5d6875;font-size:12px}.session-row__time strong,.session-row__time span,.session-row__attendance b,.session-row__attendance span{display:block}.session-row__time strong{color:#005087}.session-row__time span,.session-row__attendance span{margin-top:3px;color:#5d6875;font-size:11px}.session-row__attendance{text-align:right}.utilization{display:grid;gap:14px}.utilization p{margin:0;font-size:12px}.utilization__bar{height:10px;background:#d8eaff;border-radius:999px;overflow:hidden}.utilization__bar span{display:block;height:100%;background:#258bb5}.event-list{display:grid}.event-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:12px 16px;border-bottom:1px solid #d8e2ee}.event-row:last-child{border:0}.event-row svg{color:#1769aa}.event-row strong{font-size:11px;text-transform:uppercase;color:#49607c}.event-row p{margin:3px 0 0;font-size:12px;line-height:1.45}.event-row time{font-size:11px;color:#5d6875}@media(max-width:720px){.facility-strip{align-items:flex-start;flex-wrap:wrap;gap:8px 18px}.facility-strip>div{width:100%}.session-row{grid-template-columns:58px 1fr}.session-row__attendance{grid-column:1;text-align:left}.session-row .button{grid-column:2;width:100%}}
</style>
