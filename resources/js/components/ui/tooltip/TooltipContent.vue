<script setup>
import { TooltipContent, TooltipPortal } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
    side: { type: String, default: 'top' },
    sideOffset: { type: Number, default: 4 },
    align: { type: String, default: 'center' },
    alignOffset: { type: Number, default: 0 },
    avoidCollisions: { type: Boolean, default: true },
    collisionBoundary: { type: null, default: '' },
    collisionPadding: { type: [Number, Object], default: 0 },
    arrowPadding: { type: Number, default: 0 },
    sticky: { type: String, default: 'partial' },
    hideWhenDetached: { type: Boolean, default: false },
    forceMount: { type: Boolean, default: undefined },
    class: { type: null, default: undefined },
});
</script>

<template>
    <TooltipPortal>
        <TooltipContent
            v-bind="$attrs"
            :side="side"
            :side-offset="sideOffset"
            :align="align"
            :align-offset="alignOffset"
            :avoid-collisions="avoidCollisions"
            :collision-boundary="collisionBoundary"
            :collision-padding="collisionPadding"
            :arrow-padding="arrowPadding"
            :sticky="sticky"
            :hide-when-detached="hideWhenDetached"
            :force-mount="forceMount"
            :class="
                cn(
                    'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
                    props.class,
                )
            "
        >
            <slot />
        </TooltipContent>
    </TooltipPortal>
</template>
