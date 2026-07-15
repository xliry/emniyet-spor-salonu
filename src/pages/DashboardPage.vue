<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CalendarClock, CreditCard, Dumbbell, Plus, TriangleAlert, Waves } from 'lucide-vue-next'
import MetricCard from '@/components/MetricCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch, money, shortDate, shortTime } from '@/lib/api'
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
  <div class="page-header"><div><p class="eyebrow">Salon operasyon merkezi</p><h1>Üyelik ve Yenileme Takibi</h1><p>Salon üyeliklerini, yaklaşan bitişleri ve üyelik tahsilatını önceliklendirin.</p></div><div class="page-actions"><RouterLink v-if="auth.user?.role !== 'trainer'" class="button button--primary" to="/memberships"><Dumbbell :size="17" />Üyelik Yönetimi</RouterLink><RouterLink v-if="auth.isManager" class="button button--secondary" to="/courses/new"><Plus :size="17" />Yeni Kurs</RouterLink></div></div>
  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error" state="error" :message="error" @retry="load" />
  <template v-else-if="data">
    <section class="facility-strip" aria-label="Tesis durumu"><div><span class="status-dot" /><strong>{{ data.poolStatus?.label || 'Kontrol bekliyor' }}</strong></div><span>Su sıcaklığı <b>{{ data.poolStatus?.temperature != null ? `${data.poolStatus.temperature} °C` : '—' }}</b></span><span>pH <b>{{ data.poolStatus?.ph ?? '—' }}</b></span><span>Son kontrol <b>{{ data.poolStatus?.lastCheckedAt ? shortTime(data.poolStatus.lastCheckedAt) : 'Henüz yok' }}</b></span></section>
    <section class="metrics-grid" aria-label="Temel göstergeler">
      <MetricCard label="Aktif salon üyesi" :value="data.activeMembershipCount" detail="Erişimi açık üyelikler" :icon="Dumbbell" />
      <MetricCard label="7 gün içinde bitecek" :value="data.expiringMembershipCount" detail="Yenileme aksiyonu bekliyor" :icon="CalendarClock" :tone="data.expiringMembershipCount > 0 ? 'danger' : 'default'" />
      <MetricCard label="Üyelik açık bakiyesi" :value="money(data.membershipOutstandingBalanceCents)" detail="Aktif ve dondurulmuş üyelikler" :icon="CreditCard" :tone="data.membershipOutstandingBalanceCents > 0 ? 'danger' : 'default'" />
      <MetricCard label="Aktif kurslar" :value="data.activeCourseCount" :detail="`${data.totalActiveParticipants} kursiyer`" :icon="Waves" />
    </section>
    <div class="card-grid">
      <section class="card"><div class="card__header"><h2>Yaklaşan Üyelik Yenilemeleri</h2><RouterLink class="button button--ghost" to="/memberships?ending=7d&sort=expires_asc">Tüm liste</RouterLink></div><div v-if="data.expiringMemberships.length" class="membership-renewals"><article v-for="membership in data.expiringMemberships" :key="membership.id" class="membership-renewal"><div><strong>{{ membership.participantName }}</strong><p>{{ membership.planName }}</p></div><div><strong>{{ shortDate(membership.endsOn) }}</strong><p>{{ membership.balanceCents > 0 ? `${money(membership.balanceCents)} bakiye` : 'Tahsilat tamam' }}</p></div><RouterLink class="button button--secondary" :to="`/members/${membership.participantId}`">İncele</RouterLink></article></div><StatePanel v-else state="empty" title="Yaklaşan yenileme yok" message="Önümüzdeki 7 gün içinde bitecek aktif üyelik bulunmuyor." /></section>
      <aside class="stack">
        <section class="card card--accent"><div class="card__header"><h2>Kulvar Doluluğu</h2><StatusBadge tone="info" :label="`%${data.laneUtilizationPercent}`" /></div><div class="card__body utilization"><div class="utilization__bar"><span :style="{ width: `${Math.min(data.laneUtilizationPercent,100)}%` }" /></div><p class="muted">Seçili günün planlı kulvar kullanım oranı.</p><RouterLink class="button button--secondary button--block" to="/lane-plan">Kulvarları Planla</RouterLink></div></section>
        <section class="card"><div class="card__header"><h2>Son Operasyonlar</h2></div><div v-if="data.recentEvents.length" class="event-list"><div v-for="event in data.recentEvents" :key="event.id" class="event-row"><TriangleAlert :size="16" /><div><strong>{{ event.type }}</strong><p>{{ event.summary }}</p></div><time>{{ shortTime(event.occurredAt) }}</time></div></div><StatePanel v-else state="empty" title="Operasyon kaydı yok" message="Yetkiniz kapsamında görüntülenebilen yeni işlem bulunmuyor." /></section>
      </aside>
    </div>
  </template>
</template>

<style scoped>
.facility-strip{display:flex;align-items:center;gap:24px;min-height:50px;margin-bottom:16px;padding:10px 16px;background:#edf4ff;border:1px solid #c1c7d2;border-radius:6px;font-size:13px}.facility-strip>div{display:flex;align-items:center;gap:9px;margin-right:auto}.facility-strip span{color:#49607c}.facility-strip b{color:#051d2f}.membership-renewals{display:grid}.membership-renewal{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:18px;align-items:center;padding:16px 18px;border-bottom:1px solid #d8e2ee}.membership-renewal:last-child{border-bottom:0}.membership-renewal p{margin:4px 0 0;color:#5d6875;font-size:12px}.membership-renewal>div:last-of-type{text-align:right}.utilization{display:grid;gap:14px}.utilization p{margin:0;font-size:12px}.utilization__bar{height:10px;background:#d8eaff;border-radius:999px;overflow:hidden}.utilization__bar span{display:block;height:100%;background:#258bb5}.event-list{display:grid}.event-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:12px 16px;border-bottom:1px solid #d8e2ee}.event-row:last-child{border:0}.event-row svg{color:#1769aa}.event-row strong{font-size:11px;text-transform:uppercase;color:#49607c}.event-row p{margin:3px 0 0;font-size:12px;line-height:1.45}.event-row time{font-size:11px;color:#5d6875}@media(max-width:720px){.facility-strip{align-items:flex-start;flex-wrap:wrap;gap:8px 18px}.facility-strip>div{width:100%}.membership-renewal{grid-template-columns:1fr auto}.membership-renewal .button{grid-column:1/-1;width:100%}.membership-renewal>div:last-of-type{text-align:left}}
</style>
