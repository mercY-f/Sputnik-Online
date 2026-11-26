<script setup>
import { computed, ref } from 'vue';
import news from '@/data/news';
import NewsCard from './NewsCard.vue';

const props = defineProps({
    items: {
        type: Array,
        default: () => news,
    },
    maxHeight: {
        type: String,
        default: '50vh',
    },
    title: {
        type: String,
        default: 'LIVE FEED',
    },
    class: {
        type: null,
        default: undefined,
    },
});

const emit = defineEmits(['focus']);

const count = computed(() => String(props.items.length).padStart(2, '0'));

const collapsed = ref(false);

function toggle() {
    collapsed.value = !collapsed.value;
}

function onFocus(catalogNumber) {
    emit('focus', catalogNumber);
}
</script>

<template>
    <section class="news-feed" :class="props.class">
        <div
            class="news-feed-head"
            :class="{ closed: collapsed }"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed"
            @click="toggle"
            @keydown.enter="toggle"
            @keydown.space.prevent="toggle"
        >
            <div class="news-feed-head-left">
                <span class="news-feed-mark" aria-hidden="true">■</span>
                <h2 class="news-feed-title">{{ title }}</h2>
            </div>
            <div class="news-feed-head-right">
                <span class="news-feed-count">{{ count }}</span>
                <span class="news-feed-caret" aria-hidden="true">{{ collapsed ? '[+]' : '[–]' }}</span>
            </div>
        </div>

        <div v-show="!collapsed" class="news-feed-list" :style="{ maxHeight: maxHeight }">
            <NewsCard
                v-for="item in items"
                :key="item.id"
                :item="item"
                @focus="onFocus"
            />
            <div v-if="!items.length" class="news-feed-empty">НЕТ СОБЫТИЙ</div>
        </div>
    </section>
</template>

<style scoped>
.news-feed {
    display: flex;
    flex-direction: column;
    min-height: 0;
    font-family: 'JetBrains Mono', monospace;
    color: var(--ink);
}

.news-feed-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--ink);
    margin-bottom: 6px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.news-feed-head.closed {
    margin-bottom: 0;
    border-bottom: 1px solid var(--surface);
}

.news-feed-head:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
}

.news-feed-head-left,
.news-feed-head-right {
    display: flex;
    align-items: center;
    gap: 6px;
}

.news-feed-mark {
    font-size: 8px;
    line-height: 1;
}

.news-feed-title {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
}

.news-feed-count {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
}

.news-feed-caret {
    border: 1px solid var(--ink);
    padding: 0 3px;
    font-size: 9px;
    line-height: 1.4;
}

.news-feed-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--ink-muted) transparent;
    padding-right: 2px;
}

.news-feed-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    border: 1px dashed var(--ink-muted);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--ink-muted);
}
</style>
