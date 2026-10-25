<script setup>
import { DialogRoot } from 'reka-ui';

const props = defineProps({
    open: { type: Boolean, default: undefined },
    defaultOpen: { type: Boolean, default: undefined },
    modal: { type: Boolean, default: true },
});

const emits = defineEmits(['update:open']);
</script>

<template>
    <DialogRoot
        :open="open"
        :default-open="defaultOpen"
        :modal="modal"
        @update:open="emits('update:open', $event)"
    >
        <slot />
    </DialogRoot>
</template>
