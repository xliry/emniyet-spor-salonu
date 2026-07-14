<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-vue-next'
withDefaults(defineProps<{ state: 'loading' | 'empty' | 'error'; title?: string; message?: string }>(), {
  title: '', message: '',
})
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="state-panel" role="status" :aria-live="state === 'error' ? 'assertive' : 'polite'">
    <LoaderCircle v-if="state === 'loading'" class="state-panel__icon spin" :size="28" />
    <AlertCircle v-else-if="state === 'error'" class="state-panel__icon text-danger" :size="28" />
    <Inbox v-else class="state-panel__icon" :size="28" />
    <strong>{{ title || (state === 'loading' ? 'Yükleniyor' : state === 'error' ? 'Veriler alınamadı' : 'Kayıt bulunamadı') }}</strong>
    <p>{{ message || (state === 'loading' ? 'Operasyon verileri hazırlanıyor.' : state === 'error' ? 'Bağlantınızı kontrol edip yeniden deneyin.' : 'Seçili ölçütlere uygun bir kayıt yok.') }}</p>
    <button v-if="state === 'error'" class="button button--secondary" type="button" @click="$emit('retry')">Yeniden dene</button>
  </div>
</template>
