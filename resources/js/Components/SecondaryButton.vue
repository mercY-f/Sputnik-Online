<script setup>
defineProps({
    type: {
        type: String,
        default: 'button',
    },
});
</script>

<template>
    <button
        :type="type"
        class="inline-flex items-center border border-ink bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink transition-colors hover:bg-surface focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 disabled:cursor-not-allowed"
    >
        <slot />
    </button>
</template>
