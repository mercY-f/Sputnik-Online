<script setup>
import { DialogContent, DialogPortal, DialogClose } from 'reka-ui';
import { X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import SheetOverlay from './SheetOverlay.vue';
import { sheetVariants } from './variants.js';

const props = defineProps({
    side: { type: String, default: 'right' },
    class: { type: null, default: undefined },
    forceMount: { type: Boolean, default: undefined },
});
</script>

<template>
    <DialogPortal>
        <SheetOverlay />
        <DialogContent
            v-bind="$attrs"
            :force-mount="forceMount"
            :class="cn(sheetVariants({ side }), props.class)"
        >
            <slot />

            <DialogClose
                class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
            >
                <X class="h-4 w-4" />
                <span class="sr-only">Close</span>
            </DialogClose>
        </DialogContent>
    </DialogPortal>
</template>
