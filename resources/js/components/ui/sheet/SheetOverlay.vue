<script setup>
import { DialogOverlay } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
    forceMount: { type: Boolean, default: undefined },
    class: { type: null, default: undefined },
});
</script>

<template>
    <DialogOverlay
        v-bind="$attrs"
        :force-mount="forceMount"
        :class="
            cn(
                'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                props.class,
            )
        "
    />
</template>
