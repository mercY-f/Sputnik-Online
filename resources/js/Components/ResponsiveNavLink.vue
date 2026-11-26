<script setup>
import { computed } from 'vue';
import { Link } from '@inertiajs/vue3';

const props = defineProps({
    href: {
        type: String,
        required: true,
    },
    active: {
        type: Boolean,
    },
});

const classes = computed(() =>
    props.active
        ? 'block w-full ps-3 pe-4 py-2 border-l-4 border-ink text-start text-base font-medium text-ink bg-surface focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink transition-colors'
        : 'block w-full ps-3 pe-4 py-2 border-l-4 border-transparent text-start text-base font-medium text-ink-muted hover:text-ink hover:bg-surface hover:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink transition-colors',
);
</script>

<template>
    <Link :href="href" :class="classes">
        <slot />
    </Link>
</template>
