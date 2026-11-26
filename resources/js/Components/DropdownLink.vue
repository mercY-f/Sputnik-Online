<script setup>
import { Link } from '@inertiajs/vue3';

defineProps({
    href: {
        type: String,
        required: true,
    },
});
</script>

<template>
    <Link
        :href="href"
        class="block w-full px-4 py-2 text-start font-mono text-xs leading-5 text-ink transition-colors hover:bg-ink hover:text-paper focus:bg-ink focus:text-paper focus:outline-none"
    >
        <slot />
    </Link>
</template>
