<script setup>
import { TooltipRoot } from 'reka-ui';

const props = defineProps({
    defaultOpen: { type: Boolean, default: undefined },
    open: { type: Boolean, default: undefined },
    delayDuration: { type: Number, default: undefined },
    disableHoverableContent: { type: Boolean, default: undefined },
    disableClosingTrigger: { type: Boolean, default: undefined },
    disabled: { type: Boolean, default: undefined },
    ignoreNonKeyboardFocus: { type: Boolean, default: undefined },
});

const emits = defineEmits(['update:open']);
</script>

<template>
    <TooltipRoot
        :default-open="defaultOpen"
        :open="open"
        :delay-duration="delayDuration"
        :disable-hoverable-content="disableHoverableContent"
        :disable-closing-trigger="disableClosingTrigger"
        :disabled="disabled"
        :ignore-non-keyboard-focus="ignoreNonKeyboardFocus"
        @update:open="emits('update:open', $event)"
    >
        <slot />
    </TooltipRoot>
</template>
