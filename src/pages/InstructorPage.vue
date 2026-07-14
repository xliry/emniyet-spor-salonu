<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { computed, onMounted, ref } from 'vue'
import { BookOpenCheck, CalendarDays, Clock, ListChecks, Users } from 'lucide-vue-next'
import MetricCard from '@/components/MetricCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { apiFetch, shortDate, shortTime } from '@/lib/api'

interface InstructorSession { id:string;courseId:string;courseName:string;startsAt:string;endsAt:string;laneName?:string;instructorName:string;participantCount:number;attendanceCount:number }
interface InstructorResponse { date:string;sessions:InstructorSession[] }
const data=ref<InstructorResponse|null>(null);const loading=ref(true);const error=ref('')
const todaySessions=computed(()=>data.value?.sessions.filter((session)=>session.startsAt.slice(0,10)===data.value?.date)||[])
const upcoming=computed(()=>data.value?.sessions.filter((session)=>session.startsAt.slice(0,10)!==data.value?.date)||[])
const weeklyHours=computed(()=>Math.round((data.value?.sessions.reduce((sum,session)=>sum+(new Date(session.endsAt).getTime()-new Date(session.startsAt).getTime()),0)||0)/360000)/10)
const participantCount=computed(()=>data.value?.sessions.reduce((sum,session)=>sum+session.participantCount,0)||0)
const courseCount=computed(()=>new Set(data.value?.sessions.map((session)=>session.courseId)).size)
const attendanceComplete=(session:InstructorSession)=>session.participantCount>0&&session.attendanceCount>=session.participantCount
async function load(){loading.value=true;error.value='';try{data.value=await apiFetch<InstructorResponse>(`/instructor?date=${new Date().toISOString().slice(0,10)}`)}catch(cause){error.value=cause instanceof Error?cause.message:'Eğitmen çalışma alanı alınamadı.'}finally{loading.value=false}}
onMounted(load)
</script>

<template>
  <div class="page-header"><div><p class="eyebrow">Eğitmen paneli</p><h1>Eğitmen Çalışma Alanı</h1><p>Atanmış derslerinizi ve yoklama durumlarını izleyin.</p></div><StatusBadge tone="success" label="Yalnız atanmış kurslar" /></div>
  <StatePanel v-if="loading" state="loading" />
  <StatePanel v-else-if="error" state="error" :message="error" @retry="load" />
  <template v-else-if="data"><section class="metrics-grid"><MetricCard label="Bugünkü ders" :value="todaySessions.length" detail="Atanmış seans" :icon="CalendarDays" /><MetricCard label="Haftalık saat" :value="weeklyHours" detail="Planlı ders saati" :icon="Clock" /><MetricCard label="Planlı katılım" :value="participantCount" detail="Seanslardaki toplam" :icon="Users" /><MetricCard label="Aktif kurs" :value="courseCount" detail="Eğitmen sorumluluğu" :icon="BookOpenCheck" /></section><div class="card-grid"><section class="card"><div class="card__header"><h2>Bugünkü Derslerim</h2><span class="muted">{{ shortDate(data.date) }}</span></div><div v-if="todaySessions.length" class="teacher-sessions"><article v-for="session in todaySessions" :key="session.id"><div class="teacher-sessions__time"><strong>{{ shortTime(session.startsAt) }}</strong><span>{{ shortTime(session.endsAt) }}</span></div><div><h3>{{ session.courseName }}</h3><p>{{ session.laneName||'Kulvar belirtilmedi' }} · {{ session.participantCount }} kursiyer</p></div><StatusBadge :tone="attendanceComplete(session)?'success':'warning'" :label="attendanceComplete(session)?'Yoklama tamamlandı':'Yoklama bekliyor'" /><RouterLink class="button button--primary" :to="`/sessions/${session.id}/attendance`"><ListChecks :size="17" />{{ attendanceComplete(session)?'Yoklamayı Aç':'Yoklama Al' }}</RouterLink></article></div><StatePanel v-else state="empty" title="Bugün atanmış ders yok" /></section><aside class="stack"><section class="card"><div class="card__header"><h2>Yaklaşan Dersler</h2></div><div v-if="upcoming.length" class="simple-list"><RouterLink v-for="item in upcoming" :key="item.id" :to="`/courses/${item.courseId}`"><div><strong>{{ item.courseName }}</strong><span>{{ shortDate(item.startsAt) }} · {{ shortTime(item.startsAt) }}</span></div><span>{{ item.laneName||'—' }}</span></RouterLink></div><StatePanel v-else state="empty" title="Yaklaşan ders yok" /></section><section class="card"><div class="card__header"><h2>Operasyon Notu</h2></div><div class="card__body muted">Kurs gelişim notları kurs detayında yalnızca mevcut kayıt özeti olarak gösterilir.</div></section></aside></div></template>
</template>

<style scoped>
.teacher-sessions{display:grid}.teacher-sessions article{display:grid;grid-template-columns:72px minmax(180px,1fr) auto auto;gap:14px;align-items:center;padding:16px 18px;border-bottom:1px solid #d8e2ee}.teacher-sessions article:last-child{border:0}.teacher-sessions__time strong,.teacher-sessions__time span{display:block}.teacher-sessions__time strong{color:#005087;font-size:17px}.teacher-sessions__time span{margin-top:3px;color:#5d6875;font-size:11px}.teacher-sessions h3,.teacher-sessions p{margin:0}.teacher-sessions h3{font-size:15px}.teacher-sessions p{margin-top:5px;color:#5d6875;font-size:12px}.simple-list{display:grid}.simple-list a{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #d8e2ee}.simple-list strong,.simple-list span{display:block}.simple-list div span,.simple-list>a>span{margin-top:3px;color:#5d6875;font-size:11px}@media(max-width:800px){.teacher-sessions article{grid-template-columns:56px 1fr}.teacher-sessions .badge,.teacher-sessions .button{grid-column:2}.teacher-sessions .button{width:100%}}
</style>
