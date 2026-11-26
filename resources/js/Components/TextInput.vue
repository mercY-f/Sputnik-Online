<script setup>
import { onMounted, ref } from 'vue';

const model = defineModel({
    type: String,
    required: true,
});

const input = ref(null);

onMounted(() => {
    if (input.value.hasAttribute('autofocus')) {
        input.value.focus();
    }
});

defineExpose({ focus: () => input.value.focus() });
</script>

<template>
    <input
        class="text-input"
        v-model="model"
        ref="input"
    />
</template>

<style scoped>
.text-input {
    display: block;
    width: 100%;
    background: var(--paper);
    border: 1px solid var(--ink);
    border-radius: 0;
    padding: 0.55rem 0.875rem;
    font-size: 0.9rem;
    color: var(--ink);
    transition: background-color 0.15s ease, outline-color 0.15s ease;
    outline: none;
    font-family: inherit;
}
.text-input::placeholder {
    color: var(--ink-muted);
}
.text-input:focus {
    background: var(--surface);
    outline: 2px solid var(--ink);
    outline-offset: 1px;
}
</style>
