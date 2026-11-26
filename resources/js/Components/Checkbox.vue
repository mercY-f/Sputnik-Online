<script setup>
import { computed } from 'vue';

const emit = defineEmits(['update:checked']);

const props = defineProps({
    checked: {
        type: [Array, Boolean],
        required: true,
    },
    value: {
        default: null,
    },
});

const proxyChecked = computed({
    get() {
        return props.checked;
    },

    set(val) {
        emit('update:checked', val);
    },
});
</script>

<template>
    <input
        type="checkbox"
        :value="value"
        v-model="proxyChecked"
        class="checkbox-1bit border border-ink bg-paper text-ink accent-ink focus:outline-none focus:ring-0"
    />
</template>

<style scoped>
.checkbox-1bit {
    border-radius: 0 !important;
    box-shadow: none !important;
    width: 1rem;
    height: 1rem;
}
.checkbox-1bit:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
}
</style>
