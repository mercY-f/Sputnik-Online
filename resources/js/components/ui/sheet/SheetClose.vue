<script setup>
import { DialogClose } from 'reka-ui';

const props = defineProps({
    asChild: { type: Boolean, default: true },
    as: { type: null, default: 'button' },
});
</script>

<template>
    <DialogClose :as="as" :as-child="asChild">
        <slot />
    </DialogClose>
</template>
