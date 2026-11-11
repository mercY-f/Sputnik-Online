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
        class="block w-full px-4 py-2 text-start font-mono text-xs leading-5 text-foreground transition duration-150 ease-in-out hover:bg-secondary/70 focus:bg-secondary/70 focus:outline-none"
    >
        <slot />
    </Link>
</template>
