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
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 0.55rem 0.875rem;
    font-size: 0.9rem;
    color: #e2e8f0;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    outline: none;
    font-family: inherit;
}
.text-input::placeholder {
    color: #475569;
}
.text-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    background: rgba(255, 255, 255, 0.07);
}
</style>
