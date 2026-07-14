<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Banknote, CalendarClock, Dumbbell, Plus, Search, ShieldCheck, Snowflake, UserRound, Waves } from 'lucide-vue-next'
import InitialsAvatar from '@/components/InitialsAvatar.vue'
import MetricCard from '@/components/MetricCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch, money, shortDate } from '@/lib/api'
import type { Membership, MembershipsResponse, Participant } from '@/lib/types'

interface PlanOption { id: string; name: string; durationDays: number; priceCents: number; visitLimit?: number | null; poolAccess: boolean; gymAccess: boolean }
interface OptionsResponse { plans: PlanOption[]; participants: Participant[] }

const route = useRoute()
const router = useRouter()
const memberships = ref<Membership[]>([])
const plans = ref<PlanOption[]>([])
const participants = ref<Participant[]>([])
const summary = ref<MembershipsResponse['summary']>({ activeCount: 0, frozenCount: 0, expiredCount: 0, expiringSoonCount: 0, outstandingBalanceCents: 0 })
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const showForm = ref(false)
const createNewParticipant = ref(true)
const query = ref(typeof route.query.query === 'string' ? route.query.query : '')
const status = ref('')
const form = reactive({ participantId: '', firstName: '', lastName: '', phone: '', email: '', birthDate: '', emergencyContactName: '', emergencyContactPhone: '', safetyNotes: '', planId: '', startsOn: new Date().toISOString().slice(0, 10), initialPaymentCents: 0, paymentMethod: 'cash', note: '' })
let debounce: ReturnType<typeof globalThis.setTimeout>

const selectedPlan = computed(() => plans.value.find((plan) => plan.id === form.planId))
const selectedParticipant = computed(() => participants.value.find((person) => person.id === form.participantId))
const statusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { active: 'success', frozen: 'warning', expired: 'neutral', cancelled: 'danger' }
const statusLabel: Record<string, string> = { active: 'Aktif', frozen: 'Dondurulmuş', expired: 'Süresi Doldu', cancelled: 'İptal' }

function daysLeft(item: Membership) {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const end = new Date(item.endsOn)
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
}

async function load() {
  loading.value = true
  error.value = ''
  const params = new globalThis.URLSearchParams()
  if (query.value) params.set('query', query.value)
  if (status.value) params.set('status', status.value)
  try {
    const [list, optionData] = await Promise.all([
      apiFetch<MembershipsResponse>(`/memberships?${params}`),
      apiFetch<OptionsResponse>('/memberships/options'),
    ])
    memberships.value = list.items
    summary.value = list.summary
    plans.value = optionData.plans
    participants.value = optionData.participants
    if (!form.planId && plans.value[0]) form.planId = plans.value[0].id
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Üyelik bilgileri alınamadı.'
  } finally {
    loading.value = false
  }
}

async function createMembership() {
  if (!form.planId || (!createNewParticipant.value && !form.participantId) || (createNewParticipant.value && (!form.firstName || !form.lastName))) {
    formError.value = 'Üye bilgisi ve paket seçimi zorunludur.'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    await apiFetch('/memberships', {
      method: 'POST',
      body: JSON.stringify({
        participantId: createNewParticipant.value ? undefined : form.participantId,
        participant: createNewParticipant.value ? {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || null,
          email: form.email || null,
          birthDate: form.birthDate || null,
          emergencyContactName: form.emergencyContactName || null,
          emergencyContactPhone: form.emergencyContactPhone || null,
          safetyNotes: form.safetyNotes || null,
        } : undefined,
        planId: form.planId,
        startsOn: form.startsOn,
        initialPaymentCents: Math.round(Number(form.initialPaymentCents || 0) * 100),
        paymentMethod: form.paymentMethod,
        note: form.note || null,
      }),
    })
    showForm.value = false
    form.participantId = ''
    form.firstName = ''
    form.lastName = ''
    form.phone = ''
    form.email = ''
    form.birthDate = ''
    form.emergencyContactName = ''
    form.emergencyContactPhone = ''
    form.safetyNotes = ''
    form.initialPaymentCents = 0
    form.note = ''
    await load()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Üyelik açılamadı.'
  } finally {
    saving.value = false
  }
}

watch([query, status], () => {
  globalThis.clearTimeout(debounce)
  debounce = globalThis.setTimeout(() => {
    router.replace({ query: { ...(query.value ? { query: query.value } : {}), ...(status.value ? { status: status.value } : {}) } })
    load()
  }, 300)
})

onMounted(load)
</script>

<template>
  <div class="page-header">
    <div>
      <p class="eyebrow">Üyeler</p>
      <h1>Spor Salonu Üyelikleri</h1>
      <p>Salon paketleri, havuz erişimi, süre bitişi ve tahsilat durumunu tek ekranda yönetin.</p>
    </div>
    <button class="button button--primary" type="button" @click="showForm = !showForm"><Plus :size="17" />Yeni Üyelik</button>
  </div>

  <section class="metrics-grid">
    <MetricCard label="Aktif Üye" :value="summary.activeCount" detail="Salon erişimi açık" tone="default" :icon="UserRound" />
    <MetricCard label="7 Gün İçinde Bitecek" :value="summary.expiringSoonCount" detail="Resepsiyon takip listesi" tone="default" :icon="CalendarClock" />
    <MetricCard label="Dondurulmuş" :value="summary.frozenCount" detail="Geçici duraklatılan üyelik" tone="default" :icon="Snowflake" />
    <MetricCard label="Açık Bakiye" :value="money(summary.outstandingBalanceCents)" detail="Aktif üyelik tahsilatı" tone="danger" :icon="Banknote" />
  </section>

  <section v-if="showForm" class="membership-form card">
    <div class="card__header"><h2><ShieldCheck :size="20" />Yeni Üyelik Aç</h2><span class="muted">{{ selectedPlan ? money(selectedPlan.priceCents) : 'Paket seçin' }}</span></div>
    <form class="card__body form-grid" @submit.prevent="createMembership">
      <div class="field field--full membership-mode"><button class="button" :class="createNewParticipant ? 'button--primary' : 'button--secondary'" type="button" @click="createNewParticipant = true; form.participantId = ''">Yeni Üye</button><button class="button" :class="!createNewParticipant ? 'button--primary' : 'button--secondary'" type="button" @click="createNewParticipant = false">Mevcut Kişi</button></div>
      <template v-if="createNewParticipant">
        <label class="field field--third"><span>Ad</span><input v-model="form.firstName" required placeholder="Ahmet" /></label>
        <label class="field field--third"><span>Soyad</span><input v-model="form.lastName" required placeholder="Yılmaz" /></label>
        <label class="field field--third"><span>Telefon</span><input v-model="form.phone" placeholder="0 (5XX) XXX XX XX" /></label>
        <label class="field field--third"><span>E-posta</span><input v-model="form.email" type="email" placeholder="uye@example.local" /></label>
        <label class="field field--third"><span>Doğum Tarihi</span><input v-model="form.birthDate" type="date" /></label>
        <label class="field field--third"><span>Acil Durum Telefonu</span><input v-model="form.emergencyContactPhone" placeholder="0 (5XX) XXX XX XX" /></label>
      </template>
      <label v-else class="field field--full"><span>Üye</span><select v-model="form.participantId" required><option value="">Kişi seçin</option><option v-for="person in participants" :key="person.id" :value="person.id">{{ person.fullName }} · {{ person.phone || person.email || 'iletişim yok' }}</option></select></label>
      <label class="field field--third"><span>Paket</span><select v-model="form.planId" required><option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.name }} · {{ plan.durationDays }} gün</option></select></label>
      <label class="field field--third"><span>Başlangıç</span><input v-model="form.startsOn" type="date" required /></label>
      <label class="field field--third"><span>İlk Tahsilat (TL)</span><input v-model.number="form.initialPaymentCents" type="number" min="0" step="0.01" /></label>
      <label class="field field--third"><span>Ödeme Yöntemi</span><select v-model="form.paymentMethod"><option value="cash">Nakit</option><option value="card_terminal">Kart Terminali</option><option value="bank_transfer">Havale/EFT</option><option value="other">Diğer</option></select></label>
      <label class="field field--third"><span>Üye Özeti</span><input :value="selectedParticipant?.participantType === 'member' ? 'Mevcut üye kaydı' : 'Yeni salon üyesi yapılacak'" readonly /></label>
      <label class="field field--full"><span>Not</span><textarea v-model="form.note" placeholder="Sağlık notu, erişim notu veya resepsiyon açıklaması"></textarea></label>
      <div v-if="selectedPlan" class="field field--full membership-access">
        <span><Waves :size="17" />Havuz erişimi: {{ selectedPlan.poolAccess ? 'Açık' : 'Kapalı' }}</span>
        <span><Dumbbell :size="17" />Salon erişimi: {{ selectedPlan.gymAccess ? 'Açık' : 'Kapalı' }}</span>
        <span v-if="selectedPlan.visitLimit">Ziyaret limiti: {{ selectedPlan.visitLimit }}</span>
      </div>
      <p v-if="formError" class="field field--full field-error">{{ formError }}</p>
      <div class="field field--full form-actions"><button class="button button--secondary" type="button" @click="showForm = false">Vazgeç</button><button class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Kaydediliyor...' : 'Kaydı Tamamla ve Ödeme Al' }}</button></div>
    </form>
  </section>

  <section class="participant-tools">
    <label class="participant-search"><Search :size="18" /><span class="sr-only">Üye ara</span><input v-model="query" type="search" placeholder="Üye, telefon, e-posta veya paket ara" /></label>
    <label class="field type-filter"><span>Durum</span><select v-model="status"><option value="">Tümü</option><option value="active">Aktif</option><option value="frozen">Dondurulmuş</option><option value="expired">Süresi Doldu</option><option value="cancelled">İptal</option></select></label>
  </section>

  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error" state="error" :message="error" @retry="load" />
  <StatePanel v-else-if="!memberships.length" state="empty" title="Üyelik bulunamadı" message="Yeni üyelik açarak salon erişimini takip etmeye başlayın." />
  <section v-else class="card table-wrap">
    <table class="data-table membership-table">
      <thead><tr><th>Üye</th><th>Paket</th><th>Erişim</th><th>Durum</th><th>Süre</th><th>Tahsilat</th><th>Son Ödeme</th></tr></thead>
      <tbody>
        <tr v-for="item in memberships" :key="item.id">
          <td><div class="person-cell"><InitialsAvatar :name="item.participantName" size="sm" /><div><strong>{{ item.participantName }}</strong><span>{{ item.phone || item.email || 'İletişim yok' }}</span></div></div></td>
          <td><strong>{{ item.planName }}</strong><span class="muted table-sub">{{ item.durationDays }} gün</span></td>
          <td><div class="access-chips"><span v-if="item.gymAccess"><Dumbbell :size="14" />Salon</span><span v-if="item.poolAccess"><Waves :size="14" />Havuz</span></div></td>
          <td><StatusBadge :tone="statusTone[item.status] || 'neutral'" :label="statusLabel[item.status] || item.status" /></td>
          <td><strong>{{ shortDate(item.endsOn) }}</strong><span class="muted table-sub">{{ daysLeft(item) >= 0 ? `${daysLeft(item)} gün kaldı` : `${Math.abs(daysLeft(item))} gün geçti` }}</span></td>
          <td><strong>{{ money(item.paidTotalCents) }} / {{ money(item.saleAmountCents) }}</strong><span class="muted table-sub">{{ item.balanceCents > 0 ? `${money(item.balanceCents)} bakiye` : 'Kapandı' }}</span></td>
          <td>{{ item.lastPaidAt ? shortDate(item.lastPaidAt) : 'Tahsilat yok' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.membership-form{margin-bottom:18px}.membership-mode{display:flex;flex-wrap:wrap;gap:8px}.membership-access{display:flex;flex-wrap:wrap;gap:10px;padding:12px;background:#edf4ff;border:1px solid #d8e2ee}.membership-access span{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#123a5b}.form-actions{display:flex;justify-content:flex-end;gap:10px}.participant-tools{display:flex;align-items:end;gap:12px;margin-bottom:18px;padding:14px;background:#edf4ff;border:1px solid #d8e2ee}.participant-search{flex:1;min-height:42px;display:flex;align-items:center;gap:8px;padding:0 11px;background:white;border:1px solid #8fa3b7}.participant-search input{width:100%;border:0;outline:0}.type-filter{width:220px;grid-column:auto}.table-sub{display:block;margin-top:3px;font-size:11px}.access-chips{display:flex;flex-wrap:wrap;gap:6px}.access-chips span{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;background:#eaf4ff;border:1px solid #b0c9e8;color:#00497c;font-size:11px;font-weight:800}.membership-table{min-width:980px}@media(max-width:600px){.participant-tools{align-items:stretch;flex-direction:column}.type-filter{width:100%}.form-actions,.membership-mode{flex-direction:column}.form-actions .button,.membership-mode .button{width:100%}}
</style>
