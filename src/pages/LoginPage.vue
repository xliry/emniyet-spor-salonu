<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertCircle, ArrowRight, LockKeyhole, Mail, ShieldCheck, Waves } from 'lucide-vue-next'
import { ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Giriş yapılamadı. Bilgilerinizi kontrol edin.'
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-brand" aria-labelledby="brand-title">
      <div class="login-brand__mark"><Waves :size="34" /></div>
      <p class="eyebrow">Havuz ve kurs operasyonları</p>
      <h1 id="brand-title">Emniyet Spor Salonu</h1>
      <p>Günlük kurs, kulvar, yoklama, tahsilat ve havuz kontrollerini tek güvenli çalışma alanından yönetin.</p>
      <div class="login-brand__assurance"><ShieldCheck :size="20" /><span>Yetkili personel erişimi</span></div>
      <small>Zenit tarafından sağlanmaktadır</small>
    </section>
    <section class="login-card" aria-labelledby="login-title">
      <div><p class="eyebrow">Personel girişi</p><h2 id="login-title">Operasyon paneline giriş yapın</h2><p class="muted">Kurumsal hesabınızla devam edin.</p></div>
      <div v-if="error" class="notice notice--danger" role="alert"><AlertCircle :size="18" /><span>{{ error }}</span></div>
      <form class="login-form" @submit.prevent="submit">
        <label class="field field--full"><span>E-posta</span><div class="icon-input"><Mail :size="18" /><input v-model.trim="email" autocomplete="username" inputmode="email" required type="email" placeholder="ad.soyad@kurum.local" /></div></label>
        <label class="field field--full"><span>Şifre</span><div class="icon-input"><LockKeyhole :size="18" /><input v-model="password" autocomplete="current-password" required type="password" placeholder="Şifreniz" /></div></label>
        <button class="button button--primary button--block" type="submit" :disabled="auth.loading"><span>{{ auth.loading ? 'Giriş yapılıyor…' : 'Giriş yap' }}</span><ArrowRight :size="18" /></button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page{min-height:100vh;display:grid;grid-template-columns:minmax(340px,1fr) minmax(420px,620px);background:#f7f9ff}.login-brand{display:flex;flex-direction:column;justify-content:center;padding:clamp(40px,8vw,112px);background:#102a43;color:#e8f2ff}.login-brand__mark{width:62px;height:62px;display:grid;place-items:center;margin-bottom:34px;background:#1769aa;border-radius:6px}.login-brand .eyebrow{color:#9dcaff}.login-brand h1{max-width:560px;margin:0;font-size:clamp(38px,5vw,60px);line-height:1.05;letter-spacing:-.03em}.login-brand>p:not(.eyebrow){max-width:570px;margin:22px 0;color:#c6d8e6;font-size:17px;line-height:1.7}.login-brand__assurance{display:flex;align-items:center;gap:9px;margin-top:30px;font-weight:700}.login-brand small{margin-top:64px;color:#9fb2c2;letter-spacing:.08em;text-transform:uppercase}.login-card{align-self:center;margin:40px clamp(24px,7vw,88px);display:grid;gap:26px;padding:32px;background:#fff;border:1px solid #d8e2ee;border-top:4px solid #1769aa;border-radius:6px}.login-card h2{margin:0;font-size:26px}.login-card p{margin:7px 0 0}.login-form{display:grid;gap:17px}.icon-input{display:flex;align-items:center;gap:9px;min-height:46px;padding:0 12px;border:1px solid #8fa3b7;border-radius:4px;color:#49607c}.icon-input:focus-within{border-color:#1769aa;box-shadow:0 0 0 2px #d1e4ff}.icon-input input{width:100%;border:0;outline:0;background:transparent}.login-form .button{min-height:48px;margin-top:5px}@media(max-width:800px){.login-page{grid-template-columns:1fr}.login-brand{padding:36px 24px}.login-brand h1{font-size:36px}.login-brand>p:not(.eyebrow){font-size:15px}.login-brand small{margin-top:28px}.login-card{margin:24px 14px;padding:24px 20px}}
</style>
