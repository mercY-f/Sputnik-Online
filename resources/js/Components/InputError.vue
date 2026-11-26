<script setup>
defineProps({
    message: {
        type: String,
    },
});
</script>

<template>
    <div v-show="message">
        <p class="border-l-2 border-ink pl-2 font-mono text-xs text-ink">
            {{ message }}
        </p>
    </div>
</template>
