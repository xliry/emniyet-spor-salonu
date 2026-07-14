<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-vue-next'
import InitialsAvatar from '@/components/InitialsAvatar.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { ApiError, apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

const auth=useAuthStore();const router=useRouter()
async function logout(){await auth.logout();await router.push('/login')}
const roleLabel={owner:'İşletme Sahibi',manager:'Operasyon Yöneticisi',front_desk:'Resepsiyon',trainer:'Eğitmen'}
const currentPassword = ref('')
const newPassword = ref('')
const passwordConfirmation = ref('')
const passwordError = ref('')
const changingPassword = ref(false)
async function changePassword(){
  passwordError.value=''
  if(newPassword.value.length<11){passwordError.value='Yeni şifre en az 11 karakter olmalı.';return}
  if(newPassword.value!==passwordConfirmation.value){passwordError.value='Yeni şifre ve tekrar alanı aynı olmalı.';return}
  changingPassword.value=true
  try{
    await apiFetch<void>('/auth/password',{method:'POST',body:JSON.stringify({currentPassword:currentPassword.value,newPassword:newPassword.value})})
    await auth.logout().catch(()=>undefined)
    await router.replace('/login')
  }catch(cause){passwordError.value=cause instanceof ApiError?cause.message:'Şifre değiştirilemedi.'}
  finally{changingPassword.value=false}
}
</script>

<template>
  <div class="page-header"><div><p class="eyebrow">Hesap</p><h1>Ayarlar</h1><p>Profil ve aktif oturum bilgilerinizi görüntüleyin.</p></div></div>
  <div class="settings-grid"><section class="card profile-card"><div class="card__body"><InitialsAvatar v-if="auth.user" :name="auth.user.fullName" size="lg" /><div><p class="eyebrow">Personel profili</p><h2>{{ auth.user?.fullName }}</h2><p>{{ auth.user?.email }}</p></div><StatusBadge v-if="auth.user" tone="info" :label="roleLabel[auth.user.role]" /></div></section><section class="card"><div class="card__header"><h2><ShieldCheck :size="20" />Oturum Güvenliği</h2></div><div class="card__body stack"><div class="settings-row"><UserRound :size="19" /><div><strong>Aktif personel oturumu</strong><span>Bu tarayıcıda güvenli cookie ile açık.</span></div></div><div class="notice">Rol ve yetkiler sunucu tarafında her istekte doğrulanır.</div><button class="button button--danger" @click="logout"><LogOut :size="18" />Oturumu Kapat</button></div></section><section class="card password-card"><div class="card__header"><h2><KeyRound :size="20" />Şifre Değiştir</h2></div><form class="card__body password-form" @submit.prevent="changePassword"><label class="field"><span>Mevcut şifre</span><input v-model="currentPassword" autocomplete="current-password" required type="password" /></label><label class="field"><span>Yeni şifre</span><input v-model="newPassword" autocomplete="new-password" required minlength="11" type="password" /></label><label class="field"><span>Yeni şifre tekrar</span><input v-model="passwordConfirmation" autocomplete="new-password" required minlength="11" type="password" /></label><p v-if="passwordError" class="field-error">{{ passwordError }}</p><button class="button button--primary" type="submit" :disabled="changingPassword">{{ changingPassword ? 'Değiştiriliyor...' : 'Şifreyi Değiştir' }}</button></form></section><section class="card provider-card"><div class="card__body"><span>Hizmet sağlayıcı</span><strong>Zenit</strong><p>Emniyet Spor Salonu operasyon paneli</p></div></section></div>
</template>

<style scoped>
.settings-grid{max-width:900px;display:grid;grid-template-columns:1.2fr 1fr;gap:18px}.profile-card .card__body{display:grid;grid-template-columns:auto 1fr auto;gap:15px;align-items:center}.profile-card h2,.profile-card p{margin:0}.profile-card h2{font-size:21px}.profile-card p:not(.eyebrow){margin-top:4px;color:#5d6875}.card__header h2{display:flex;align-items:center;gap:8px}.settings-row{display:flex;align-items:center;gap:12px}.settings-row strong,.settings-row span{display:block}.settings-row span{margin-top:4px;color:#5d6875;font-size:12px}.password-card{grid-column:1/-1}.password-form{display:grid;grid-template-columns:repeat(3,1fr) auto;align-items:end;gap:12px}.password-form .field-error{grid-column:1/-1;margin:0}.provider-card{grid-column:1/-1}.provider-card span,.provider-card strong{display:block}.provider-card span{color:#49607c;font-size:10px;text-transform:uppercase}.provider-card strong{margin-top:4px;color:#005087;font-size:20px}.provider-card p{margin:4px 0 0;color:#5d6875}@media(max-width:720px){.settings-grid{grid-template-columns:1fr}.profile-card .card__body{grid-template-columns:auto 1fr}.profile-card .badge{grid-column:2}.password-card,.provider-card{grid-column:auto}.password-form{grid-template-columns:1fr}.password-form .button{width:100%}}
</style>
