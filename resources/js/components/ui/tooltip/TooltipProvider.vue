<script setup>
import { TooltipProvider } from 'reka-ui';

const props = defineProps({
    delayDuration: { type: Number, default: 0 },
    skipDelayDuration: { type: Number, default: 300 },
    disableClosingTrigger: { type: Boolean, default: undefined },
    disabled: { type: Boolean, default: undefined },
    ignoreNonKeyboardFocus: { type: Boolean, default: undefined },
});
</script>

<template>
    <TooltipProvider
        :delay-duration="delayDuration"
        :skip-delay-duration="skipDelayDuration"
        :disable-closing-trigger="disableClosingTrigger"
        :disabled="disabled"
        :ignore-non-keyboard-focus="ignoreNonKeyboardFocus"
    >
        <slot />
    </TooltipProvider>
</template>
