<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
import type { Component } from 'vue'
withDefaults(defineProps<{ label: string; value: string | number; detail?: string; icon: Component; tone?: 'default' | 'danger' }>(), { detail: '', tone: 'default' })
</script>

<template>
  <article class="metric-card" :class="{ 'metric-card--danger': tone === 'danger' }">
    <div><p class="eyebrow">{{ label }}</p><strong class="metric-card__value">{{ value }}</strong><p v-if="detail" class="muted">{{ detail }}</p></div>
    <component :is="icon" class="metric-card__icon" :size="24" />
  </article>
</template>
