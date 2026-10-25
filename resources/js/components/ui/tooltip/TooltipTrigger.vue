<script setup>
import { TooltipTrigger } from 'reka-ui';

const props = defineProps({
    asChild: { type: Boolean, default: true },
    as: { type: null, default: 'button' },
});
</script>

<template>
    <TooltipTrigger :as="as" :as-child="asChild">
        <slot />
    </TooltipTrigger>
</template>
