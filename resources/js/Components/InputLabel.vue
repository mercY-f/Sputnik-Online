<script setup>
defineProps({
    value: {
        type: String,
    },
});
</script>

<template>
    <label class="block font-mono text-xs font-medium uppercase tracking-wider text-ink">
        <span v-if="value">{{ value }}</span>
        <span v-else><slot /></span>
    </label>
</template>
