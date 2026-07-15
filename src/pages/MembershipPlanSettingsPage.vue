<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { computed, onMounted, reactive, ref } from 'vue'
import { Archive, ArrowLeft, Dumbbell, Pencil, Plus, Save, Waves } from 'lucide-vue-next'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch, money } from '@/lib/api'

interface Plan { id:string; name:string; durationDays:number; priceCents:number; visitLimit:number|null; poolAccess:boolean; gymAccess:boolean; isActive:boolean; updatedAt:string }
const plans=ref<Plan[]>([]); const loading=ref(true); const saving=ref(false); const error=ref(''); const notice=ref(''); const editingId=ref<string|null>(null); const showForm=ref(false)
const blank=()=>({name:'',durationDays:30,priceTl:0,visitLimit:null as number|null,poolAccess:true,gymAccess:true,isActive:true})
const form=reactive(blank())
const activePlans=computed(()=>plans.value.filter((plan)=>plan.isActive).length)

function reset(){Object.assign(form,blank());editingId.value=null;showForm.value=false;error.value=''}
function edit(plan:Plan){editingId.value=plan.id;Object.assign(form,{name:plan.name,durationDays:plan.durationDays,priceTl:plan.priceCents/100,visitLimit:plan.visitLimit,poolAccess:plan.poolAccess,gymAccess:plan.gymAccess,isActive:plan.isActive});showForm.value=true;error.value='';notice.value=''}
async function load(){loading.value=true;error.value='';try{plans.value=(await apiFetch<{items:Plan[]}>('/membership-plans')).items}catch(cause){error.value=cause instanceof Error?cause.message:'Paket ayarları yüklenemedi.'}finally{loading.value=false}}
async function save(){
  if(!form.name.trim()){error.value='Paket adı zorunludur.';return}
  if(!form.gymAccess&&!form.poolAccess){error.value='Pakette en az bir erişim alanı seçin.';return}
  saving.value=true;error.value='';notice.value=''
  const payload={name:form.name.trim(),durationDays:Number(form.durationDays),priceCents:Math.round(Number(form.priceTl||0)*100),visitLimit:form.visitLimit?Number(form.visitLimit):null,poolAccess:form.poolAccess,gymAccess:form.gymAccess,isActive:form.isActive}
  try{await apiFetch(editingId.value?`/membership-plans/${editingId.value}`:'/membership-plans',{method:editingId.value?'PATCH':'POST',body:JSON.stringify(payload)});notice.value=editingId.value?'Paket ayarları güncellendi.':'Yeni paket oluşturuldu.';reset();await load()}catch(cause){error.value=cause instanceof Error?cause.message:'Paket kaydedilemedi.'}finally{saving.value=false}
}
async function toggle(plan:Plan){
  saving.value=true;error.value='';notice.value=''
  try{await apiFetch(`/membership-plans/${plan.id}`,{method:'PATCH',body:JSON.stringify({name:plan.name,durationDays:plan.durationDays,priceCents:plan.priceCents,visitLimit:plan.visitLimit,poolAccess:plan.poolAccess,gymAccess:plan.gymAccess,isActive:!plan.isActive})});notice.value=plan.isActive?'Paket yeni üyeliklere kapatıldı.':'Paket yeni üyeliklere tekrar açıldı.';await load()}catch(cause){error.value=cause instanceof Error?cause.message:'Paket durumu güncellenemedi.'}finally{saving.value=false}
}
onMounted(load)
</script>

<template>
  <RouterLink class="back-link" to="/settings"><ArrowLeft :size="16" />Ayarlara dön</RouterLink>
  <div class="page-header"><div><p class="eyebrow">Ayarlar · Salon</p><h1>Üyelik Paketleri</h1><p>Paket fiyatlarını, sürelerini ve salon-havuz erişimini yeni üyelikler için yönetin.</p></div><button class="button button--primary" type="button" @click="showForm=true;editingId=null;Object.assign(form,blank())"><Plus :size="17" />Yeni paket</button></div>
  <section class="plan-summary"><div><strong>{{ activePlans }}</strong><span>Aktif paket</span></div><p>Mevcut üye kayıtlarının satış tutarı sabit kalır; buradaki fiyat değişikliği yalnızca yeni paket atamalarında kullanılır.</p></section>
  <section v-if="showForm" class="card form-card"><div class="card__header"><h2>{{ editingId?'Paketi düzenle':'Yeni paket oluştur' }}</h2></div><form class="card__body form-grid" @submit.prevent="save"><label class="field field--full"><span>Paket adı</span><input v-model="form.name" required maxlength="120" placeholder="Örn. 1 Aylık Salon + Havuz" /></label><label class="field"><span>Süre (gün)</span><input v-model.number="form.durationDays" required min="1" max="3650" type="number" /></label><label class="field"><span>Liste fiyatı (TL)</span><input v-model.number="form.priceTl" required min="0" step="0.01" type="number" /></label><label class="field"><span>Ziyaret limiti</span><input v-model.number="form.visitLimit" min="1" max="10000" type="number" placeholder="Sınırsız" /><small>Boş bırakırsanız sınırsızdır.</small></label><label class="access-option"><input v-model="form.gymAccess" type="checkbox" /><Dumbbell :size="18" /><span><strong>Salon erişimi</strong><small>Fitness alanı kullanımı</small></span></label><label class="access-option"><input v-model="form.poolAccess" type="checkbox" /><Waves :size="18" /><span><strong>Havuz erişimi</strong><small>Havuz kullanımı</small></span></label><label v-if="editingId" class="access-option"><input v-model="form.isActive" type="checkbox" /><Archive :size="18" /><span><strong>Yeni üyeliklere açık</strong><small>Kapalı paket geçmiş kayıtlarda korunur.</small></span></label><p v-if="error" class="field field--full field-error">{{ error }}</p><div class="field field--full form-actions"><button class="button button--secondary" type="button" @click="reset">Vazgeç</button><button class="button button--primary" :disabled="saving"><Save :size="16" />{{ saving?'Kaydediliyor…':'Paketi kaydet' }}</button></div></form></section>
  <p v-if="notice" class="notice">{{ notice }}</p>
  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error&&!showForm" state="error" :message="error" @retry="load" />
  <StatePanel v-else-if="!plans.length" state="empty" title="Paket yok" message="İlk salon paketini oluşturarak yeni üyelik açabilirsiniz." />
  <section v-else class="plan-grid"><article v-for="plan in plans" :key="plan.id" class="card plan-card" :class="{'plan-card--inactive':!plan.isActive}"><div class="card__header"><div><h2>{{ plan.name }}</h2><p>{{ plan.durationDays }} gün · {{ money(plan.priceCents) }}</p></div><StatusBadge :tone="plan.isActive?'success':'neutral'" :label="plan.isActive?'Aktif':'Kapalı'" /></div><div class="card__body"><div class="plan-access"><span :class="{muted:!plan.gymAccess}"><Dumbbell :size="17" />{{ plan.gymAccess?'Salon':'Salon yok' }}</span><span :class="{muted:!plan.poolAccess}"><Waves :size="17" />{{ plan.poolAccess?'Havuz':'Havuz yok' }}</span></div><p>{{ plan.visitLimit?`${plan.visitLimit} ziyaret limiti`:'Sınırsız ziyaret' }}</p><div class="plan-actions"><button class="button button--secondary" type="button" @click="edit(plan)"><Pencil :size="16" />Düzenle</button><button class="button button--secondary" type="button" :disabled="saving" @click="toggle(plan)">{{ plan.isActive?'Yeni üyeliğe kapat':'Tekrar aç' }}</button></div></div></article></section>
</template>

<style scoped>
.back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;color:#005087;font-size:12px;font-weight:800}.plan-summary{display:flex;align-items:center;gap:18px;margin-bottom:18px;padding:15px 18px;border:1px solid #b0c9e8;background:#edf4ff}.plan-summary div{display:grid;gap:2px;min-width:100px}.plan-summary strong{color:#005087;font-size:26px}.plan-summary span{color:#49607c;font-size:11px;font-weight:800;text-transform:uppercase}.plan-summary p{margin:0;color:#31506c;font-size:12px}.form-card{margin-bottom:18px}.access-option{display:flex;align-items:center;gap:9px;min-height:68px;padding:12px;border:1px solid #c1c7d2;background:#fbfdff}.access-option input{width:17px;height:17px}.access-option svg{color:#005087}.access-option span{display:grid;gap:3px}.access-option small,.field small{color:#5d6875;font-size:11px}.form-actions{display:flex;justify-content:flex-end;gap:10px}.plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.plan-card{min-height:220px}.plan-card--inactive{opacity:.72}.plan-card h2{margin:0;font-size:17px}.plan-card .card__header p{margin:4px 0 0;color:#49607c;font-size:12px}.plan-access{display:flex;flex-wrap:wrap;gap:9px}.plan-access span{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #b0c9e8;background:#eaf4ff;color:#00497c;font-size:12px;font-weight:800}.plan-access .muted{border-color:#d8e2ee;background:#f7f9fb;color:#5d6875}.plan-card .card__body>p{margin:14px 0;color:#49607c;font-size:12px}.plan-actions{display:flex;gap:8px;margin-top:18px}.notice{margin:0 0 18px;padding:11px 13px;border:1px solid #9ac8a4;background:#e9f7ec;color:#164b24;font-size:13px}@media(max-width:900px){.plan-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.plan-summary{align-items:flex-start;flex-direction:column}.plan-grid{grid-template-columns:1fr}.form-actions,.plan-actions{flex-direction:column}.form-actions .button,.plan-actions .button{width:100%}}
</style>
