<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle, ArrowLeft, ArrowRight, Check, Save, Waves } from 'lucide-vue-next'
import { ApiError, apiFetch, money } from '@/lib/api'
import type { CourseListResponse } from '@/lib/types'

const router = useRouter()
const step = ref(0)
const saving = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string[] | string>>({})
const options = ref<NonNullable<CourseListResponse['filters']>>({})
const steps = ['Temel Bilgiler','Dönem ve Tarihler','Eğitmen','Haftalık Program','Havuz ve Kulvar','Kontenjan ve Ücret','İnceleme']
const days = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar']
const form = reactive({
  name: '', category: 'swimming', level: 'beginner', branchId: '', termId: '', instructorId: '', ageMin: 18 as number | null, ageMax: null as number | null,
  schedules: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00', poolLaneId: '' }], capacity: 12, minimumParticipants: 1, feeAmount: 0, memberDiscountPercent: 0, notes: '',
})
const current = computed(() => steps[step.value])
const selectedLabel = (items: Array<{ id: string; name: string }> | undefined, id: string) => items?.find((item) => item.id === id)?.name || 'Belirtilmedi'

async function loadOptions() {
  try {
    const response = await apiFetch<CourseListResponse>('/courses?page=1&pageSize=1')
    options.value = response.filters || {}
    if (!form.branchId && options.value.branches?.[0]) form.branchId = options.value.branches[0].id
    if (!form.termId && options.value.terms?.[0]) form.termId = options.value.terms[0].id
    if (!form.instructorId && options.value.instructors?.[0]) form.instructorId = options.value.instructors[0].id
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Kurs seçenekleri yüklenemedi.'
  }
}

function addSchedule() { form.schedules.push({ dayOfWeek: 1, startTime: '18:00', endTime: '19:00', poolLaneId: '' }) }
function removeSchedule(index: number) { if (form.schedules.length > 1) form.schedules.splice(index, 1) }
function next() { error.value = ''; if (step.value < steps.length - 1) step.value += 1 }
function previous() { if (step.value > 0) step.value -= 1 }

async function submit() {
  saving.value = true; error.value = ''; fieldErrors.value = {}
  try {
    const response = await apiFetch<{ course: { id: string } }>('/courses', { method: 'POST', body: JSON.stringify({
      branchId: form.branchId, termId: form.termId, instructorId: form.instructorId,
      name: form.name, category: form.category, level: form.level, ageMin: form.ageMin, ageMax: form.ageMax,
      capacity: form.capacity, minimumParticipants: form.minimumParticipants,
      feeAmountCents: Math.round(Number(form.feeAmount) * 100), memberDiscountPercent: form.memberDiscountPercent,
      status: 'upcoming', description: form.notes.trim() || null,
      scheduleRules: form.schedules.map((item) => ({ dayOfWeek: item.dayOfWeek, startsAtLocal: item.startTime, endsAtLocal: item.endTime, poolLaneId: item.poolLaneId })),
    }) })
    await router.push(`/courses/${response.course.id}`)
  } catch (cause) {
    if (cause instanceof ApiError) { error.value = cause.message; fieldErrors.value = cause.fieldErrors }
    else error.value = 'Kurs oluşturulamadı.'
  } finally { saving.value = false }
}
onMounted(loadOptions)
</script>

<template>
  <div class="page-header"><div><p class="eyebrow">Yeni kurs</p><h1>Kurs Oluşturma</h1><p>Bilgileri adım adım tamamlayın; kayıt yalnız son onayda oluşturulur.</p></div><span class="draft-pill">Taslak · {{ step + 1 }}/{{ steps.length }}</span></div>
  <div class="create-layout">
    <aside class="stepper card" aria-label="Kurs oluşturma adımları"><button v-for="(label,index) in steps" :key="label" type="button" :class="{active:index===step,done:index<step}" :aria-current="index===step?'step':undefined" @click="step=index"><span><Check v-if="index<step" :size="15" /><template v-else>{{ String(index+1).padStart(2,'0') }}</template></span><div><strong>{{ label }}</strong><small>{{ index<step?'Tamamlandı':index===step?'Düzenleniyor':'Bekliyor' }}</small></div></button></aside>
    <form class="card create-form" @submit.prevent="submit">
      <div class="card__header"><div><p class="eyebrow">Adım {{ step + 1 }}</p><h2>{{ current }}</h2></div><Waves :size="23" /></div>
      <div class="card__body">
        <div v-if="error" class="notice notice--danger" role="alert"><AlertCircle :size="18" /><span>{{ error }}</span></div>
        <section v-if="step===0" class="form-grid">
          <label class="field field--full"><span>Kurs Adı</span><input v-model.trim="form.name" required placeholder="Örn. Yetişkin Başlangıç Yüzme" /><small v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name }}</small></label>
          <label class="field field--third"><span>Kategori</span><select v-model="form.category"><option value="swimming">Yüzme Kursu</option><option value="private">Özel Ders</option><option value="aquatic_fitness">Su İçi Egzersiz</option></select></label>
          <label class="field field--third"><span>Alt Yaş</span><input v-model.number="form.ageMin" min="0" max="120" type="number" /></label>
          <label class="field field--third"><span>Üst Yaş</span><input v-model.number="form.ageMax" min="0" max="120" type="number" /></label>
          <label class="field field--third"><span>Seviye</span><select v-model="form.level"><option value="beginner">Başlangıç</option><option value="intermediate">Orta</option><option value="advanced">İleri</option><option value="special">Özel</option></select></label>
          <label class="field field--full"><span>Açıklama / Operasyon Notu</span><textarea v-model.trim="form.notes" placeholder="Kurs ekibinin bilmesi gereken kısa bilgiler" /></label>
        </section>
        <section v-else-if="step===1" class="form-grid"><label class="field"><span>Şube</span><select v-model="form.branchId" required><option disabled value="">Şube seçin</option><option v-for="item in options.branches||[]" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label class="field"><span>Dönem ve Tarih Aralığı</span><select v-model="form.termId" required><option disabled value="">Dönem seçin</option><option v-for="item in options.terms||[]" :key="item.id" :value="item.id">{{ item.name }}</option></select><small>Seans tarihleri seçilen dönemin başlangıç ve bitiş tarihlerinden üretilir.</small></label></section>
        <section v-else-if="step===2" class="form-grid"><label class="field field--full"><span>Eğitmen</span><select v-model="form.instructorId" required><option disabled value="">Eğitmen seçin</option><option v-for="item in options.instructors||[]" :key="item.id" :value="item.id">{{ item.name }}</option></select><small>Yalnız aktif ve yetkili eğitmenler listelenir.</small></label></section>
        <section v-else-if="step===3" class="stack"><div v-for="(schedule,index) in form.schedules" :key="index" class="schedule-row"><label class="field"><span>Gün</span><select v-model.number="schedule.dayOfWeek"><option v-for="(day,dayIndex) in days" :key="day" :value="dayIndex+1">{{ day }}</option></select></label><label class="field"><span>Başlangıç</span><input v-model="schedule.startTime" type="time" /></label><label class="field"><span>Bitiş</span><input v-model="schedule.endTime" type="time" /></label><button class="button button--danger" type="button" :disabled="form.schedules.length===1" @click="removeSchedule(index)">Kaldır</button></div><button class="button button--secondary" type="button" @click="addSchedule">Program Satırı Ekle</button></section>
        <section v-else-if="step===4" class="stack"><div class="notice"><Waves :size="18" /><span>Her haftalık program satırına bir kulvar atayın. Çakışmalar son kayıtta sunucu tarafından doğrulanır.</span></div><div v-for="(schedule,index) in form.schedules" :key="index" class="lane-row"><div><strong>{{ days[schedule.dayOfWeek-1] }}</strong><small>{{ schedule.startTime }}–{{ schedule.endTime }}</small></div><label class="field"><span>Kulvar</span><select v-model="schedule.poolLaneId" required><option disabled value="">Kulvar seçin</option><option v-for="item in options.lanes||[]" :key="item.id" :value="item.id">{{ item.name }}</option></select></label></div></section>
        <section v-else-if="step===5" class="form-grid"><label class="field field--quarter"><span>Minimum Katılım</span><input v-model.number="form.minimumParticipants" min="1" :max="form.capacity" required type="number" /></label><label class="field field--quarter"><span>Kontenjan</span><input v-model.number="form.capacity" min="1" max="200" required type="number" /></label><label class="field field--quarter"><span>Dönem Ücreti (₺)</span><input v-model.number="form.feeAmount" min="0" step="0.01" required type="number" /></label><label class="field field--quarter"><span>Üye İndirimi (%)</span><input v-model.number="form.memberDiscountPercent" min="0" max="100" type="number" /></label><div class="field field--full fee-preview"><span>Standart ücret</span><strong>{{ money(Math.round(Number(form.feeAmount)*100)) }}</strong></div></section>
        <section v-else class="review"><div><span>Kurs</span><strong>{{ form.name || 'Belirtilmedi' }}</strong></div><div><span>Dönem</span><strong>{{ selectedLabel(options.terms, form.termId) }}</strong></div><div><span>Eğitmen</span><strong>{{ selectedLabel(options.instructors, form.instructorId) }}</strong></div><div><span>Program</span><strong>{{ form.schedules.length }} haftalık seans</strong></div><div><span>Kontenjan</span><strong>{{ form.capacity }} kişi</strong></div><div><span>Ücret</span><strong>{{ money(Math.round(Number(form.feeAmount)*100)) }}</strong></div><div class="notice"><AlertCircle :size="18" /><span>Kaydettiğinizde seanslar üretilir ve kulvar çakışmaları veritabanında kontrol edilir.</span></div></section>
      </div>
      <footer class="form-footer"><button class="button button--secondary" type="button" @click="step===0?router.push('/courses'):previous()"><ArrowLeft :size="17" />{{ step===0?'Vazgeç':'Önceki' }}</button><button v-if="step<steps.length-1" class="button button--primary" type="button" @click="next">Sonraki Adım<ArrowRight :size="17" /></button><button v-else class="button button--primary" type="submit" :disabled="saving"><Save :size="17" />{{ saving?'Kaydediliyor…':'Kursu Oluştur' }}</button></footer>
    </form>
  </div>
</template>

<style scoped>
.draft-pill{padding:7px 10px;background:#d8eaff;border:1px solid #9dcaff;border-radius:4px;color:#00497c;font-size:11px;font-weight:800;text-transform:uppercase}.create-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px;max-width:1240px;margin:auto}.stepper{align-self:start;display:grid;padding:10px;position:sticky;top:84px}.stepper button{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;padding:11px;border:0;border-left:3px solid transparent;background:transparent;text-align:left;color:#5d6875}.stepper button>span{width:30px;height:30px;display:grid;place-items:center;border:1px solid #8fa3b7;border-radius:50%;font-size:10px;font-weight:800}.stepper button strong,.stepper button small{display:block}.stepper button strong{font-size:12px}.stepper button small{margin-top:2px;font-size:10px;font-weight:400}.stepper button.active{background:#edf4ff;border-left-color:#1769aa;color:#005087}.stepper button.active>span{background:#1769aa;color:white;border-color:#1769aa}.stepper button.done>span{background:#e0f4e8;color:#176d48;border-color:#76b997}.create-form{min-height:650px;display:flex;flex-direction:column}.create-form .card__body{flex:1}.create-form .notice{margin-bottom:16px}.schedule-row{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:12px;align-items:end;padding:14px;background:#edf4ff;border:1px solid #d8e2ee}.schedule-row .field{grid-column:auto}.lane-row{display:grid;grid-template-columns:200px 1fr;gap:18px;align-items:center;padding:14px;border-bottom:1px solid #d8e2ee}.lane-row small{display:block;margin-top:4px;color:#5d6875}.lane-row .field{grid-column:auto}.fee-preview{padding:18px;background:#edf4ff;border-left:4px solid #258bb5}.fee-preview strong{font-size:28px}.review{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.review>div:not(.notice){padding:14px;background:#edf4ff;border:1px solid #d8e2ee}.review span,.review strong{display:block}.review span{margin-bottom:5px;color:#49607c;font-size:11px;text-transform:uppercase}.review .notice{grid-column:1/-1}.form-footer{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-top:1px solid #d8e2ee;background:#f8fbff}@media(max-width:900px){.create-layout{grid-template-columns:1fr}.stepper{position:static;display:flex;overflow:auto}.stepper button{min-width:150px}.schedule-row{grid-template-columns:1fr 1fr}.schedule-row .field{grid-column:auto}.lane-row{grid-template-columns:1fr}.review{grid-template-columns:1fr}.review .notice{grid-column:auto}}@media(max-width:600px){.schedule-row{grid-template-columns:1fr}.schedule-row .field{grid-column:1}.form-footer .button{flex:1}}
</style>
