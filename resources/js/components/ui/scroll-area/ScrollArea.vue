<script setup>
import { ScrollAreaRoot, ScrollAreaViewport, ScrollAreaCorner } from 'reka-ui';
import { cn } from '@/lib/utils';
import ScrollBar from './ScrollBar.vue';

const props = defineProps({
    type: { type: String, default: 'hover' },
    dir: { type: String, default: undefined },
    scrollHideDelay: { type: Number, default: 600 },
    class: { type: null, default: undefined },
});
</script>

<template>
    <ScrollAreaRoot
        :type="type"
        :dir="dir"
        :scroll-hide-delay="scrollHideDelay"
        :class="cn('relative overflow-hidden', props.class)"
    >
        <ScrollAreaViewport class="h-full w-full rounded-[inherit]">
            <slot />
        </ScrollAreaViewport>
        <ScrollBar />
        <ScrollAreaCorner />
    </ScrollAreaRoot>
</template>
