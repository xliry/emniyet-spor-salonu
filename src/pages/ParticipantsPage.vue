<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, UserPlus } from 'lucide-vue-next'
import InitialsAvatar from '@/components/InitialsAvatar.vue'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch } from '@/lib/api'
import type { Participant } from '@/lib/types'

const route=useRoute();const router=useRouter();const items=ref<Participant[]>([]);const loading=ref(true);const error=ref('');const query=ref(typeof route.query.query==='string'?route.query.query:'');const type=ref('')
let debounce:ReturnType<typeof globalThis.setTimeout>
const displayItems=computed(()=>type.value?items.value.filter((person)=>person.participantType===type.value):items.value)
async function load(){loading.value=true;error.value='';const params=new globalThis.URLSearchParams();if(query.value)params.set('query',query.value);try{const response=await apiFetch<{items:Participant[]}>(`/participants?${params}`);items.value=response.items}catch(cause){error.value=cause instanceof Error?cause.message:'Kursiyerler alınamadı.'}finally{loading.value=false}}
watch([query,type],()=>{globalThis.clearTimeout(debounce);debounce=globalThis.setTimeout(()=>{router.replace({query:{...(query.value?{query:query.value}:{}),...(type.value?{type:type.value}:{})}});load()},300)})
onMounted(load)
</script>

<template>
  <div class="page-header"><div><p class="eyebrow">Kursiyer dizini</p><h1>Kursiyerler</h1><p>İletişim, veli ve aktif kurs kayıtlarını operasyon amacıyla görüntüleyin.</p></div><RouterLink class="button button--primary" to="/courses"><UserPlus :size="17" />Kursa Kayıt Aç</RouterLink></div>
  <section class="participant-tools"><label class="participant-search"><Search :size="18" /><span class="sr-only">Kursiyer ara</span><input v-model="query" type="search" placeholder="Ad, telefon veya e-posta ara" /></label><label class="field type-filter"><span>Tür</span><select v-model="type"><option value="">Tümü</option><option value="member">Üye</option><option value="external">Harici</option></select></label></section>
  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error" state="error" :message="error" @retry="load" />
  <StatePanel v-else-if="!displayItems.length" state="empty" title="Kursiyer bulunamadı" message="Aramayı değiştirin veya kurs listesinden yeni kayıt başlatın." />
  <section v-else class="card table-wrap"><table class="data-table"><thead><tr><th>Kursiyer</th><th>Tür</th><th>İletişim</th><th>Veli</th><th>Aktif Kayıt</th><th>Mevcut Kurs</th></tr></thead><tbody><tr v-for="person in displayItems" :key="person.id" class="participant-row" tabindex="0" @click="router.push(`/members/${person.id}`)" @keydown.enter="router.push(`/members/${person.id}`)"><td><div class="person-cell"><InitialsAvatar :name="person.fullName" size="sm" /><strong>{{ person.fullName }}</strong></div></td><td><StatusBadge tone="info" :label="person.participantType==='member'?'Üye':'Harici'" /></td><td>{{ person.phone||person.email||'—' }}</td><td>{{ person.guardianName||'Gerekli değil' }}</td><td>{{ person.activeEnrollmentCount||0 }}</td><td>{{ person.currentCourseName||'Aktif kurs yok' }}</td></tr></tbody></table></section>
</template>

<style scoped>
.participant-tools{display:flex;align-items:end;gap:12px;margin-bottom:18px;padding:14px;background:#edf4ff;border:1px solid #d8e2ee}.participant-search{flex:1;min-height:42px;display:flex;align-items:center;gap:8px;padding:0 11px;background:white;border:1px solid #8fa3b7}.participant-search input{width:100%;border:0;outline:0}.type-filter{width:190px;grid-column:auto}@media(max-width:600px){.participant-tools{align-items:stretch;flex-direction:column}.type-filter{width:100%}}
</style>
