<script setup>
import { DialogTrigger } from 'reka-ui';

const props = defineProps({
    asChild: { type: Boolean, default: true },
    as: { type: null, default: 'button' },
});
</script>

<template>
    <DialogTrigger :as="as" :as-child="asChild">
        <slot />
    </DialogTrigger>
</template>
