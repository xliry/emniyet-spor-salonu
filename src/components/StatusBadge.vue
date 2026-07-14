<script setup lang="ts">
/* eslint vue/singleline-html-element-content-newline: "off", vue/max-attributes-per-line: "off", vue/html-self-closing: "off" */
withDefaults(defineProps<{ tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }>(), { tone: 'neutral' })
</script>

<template><span class="badge" :class="`badge--${tone}`"><span class="badge__dot" />{{ label }}</span></template>
