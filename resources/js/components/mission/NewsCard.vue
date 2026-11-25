<script setup>
import { computed, ref } from 'vue';
import { categoryLabels } from '@/data/news';

const props = defineProps({
    item: {
        type: Object,
        required: true,
    },
});

const emit = defineEmits(['focus']);

const expanded = ref(false);

function toggle() {
    expanded.value = !expanded.value;
}

const label = computed(() => categoryLabels[props.item.category] ?? props.item.category);

const dotClass = computed(() => {
    switch (props.item.category) {
        case 'launch':
            return 'is-launch';
        case 'science':
            return 'is-science';
        case 'discovery':
            return 'is-discovery';
        default:
            return 'is-default';
    }
});

const formattedTime = computed(() => {
    const date = new Date(props.item.publishedAt);

    if (Number.isNaN(date.getTime())) {
        return '--:-- UTC';
    }

    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = date.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', '');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return `${day} ${month} · ${hours}:${minutes} UTC`;
});

function emitFocus() {
    if (!props.item.satellite?.catalogNumber) return;

    emit('focus', props.item.satellite.catalogNumber);
}
</script>

<template>
    <article
        class="news-card"
        :class="{ expanded }"
        role="button"
        tabindex="0"
        :aria-expanded="expanded"
        @click="toggle"
        @keydown.enter.self="toggle"
        @keydown.space.prevent="toggle"
    >
        <header class="news-card-head">
            <span class="news-dot" :class="dotClass" aria-hidden="true"></span>
            <span v-if="expanded" class="news-tag">{{ label }}</span>
            <span class="news-time">{{ formattedTime }}</span>
        </header>

        <h3 class="news-title" :class="{ clipped: !expanded }">{{ item.title }}</h3>

        <div v-if="expanded" class="news-body">
            <p class="news-summary">{{ item.summary }}</p>

            <div class="news-foot">
                <span class="news-source">{{ item.source }}</span>
                <button
                    v-if="item.satellite?.catalogNumber"
                    type="button"
                    class="news-focus-btn"
                    @click.stop="emitFocus"
                    @keydown.enter.stop="emitFocus"
                    @keydown.space.stop="emitFocus"
                >
                    [ Найти на орбите ]
                </button>
            </div>
        </div>
    </article>
</template>

<style scoped>
.news-card {
    border: 1px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    padding: 6px 8px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    box-sizing: border-box;
}

.news-card:hover {
    background: var(--surface);
}

.news-card:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
}

.news-card-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    line-height: 1;
}

.news-dot {
    width: 7px;
    height: 7px;
    border: 1px solid var(--ink);
    background: var(--paper);
    flex-shrink: 0;
}

.news-dot.is-launch {
    background: var(--ink);
}

.news-dot.is-science {
    background: var(--ink-muted);
}

.news-dot.is-discovery {
    background: var(--paper);
    border-width: 2px;
}

.news-dot.is-default {
    background: var(--surface);
}

.news-tag {
    border: 1px solid var(--ink);
    padding: 0 4px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: var(--surface);
}

.news-time {
    margin-left: auto;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.news-title {
    margin: 5px 0 0;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.35;
}

.news-title.clipped {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.news-body {
    margin-top: 6px;
}

.news-summary {
    margin: 0;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--ink-muted);
}

.news-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed var(--ink-muted);
}

.news-source {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.news-focus-btn {
    flex-shrink: 0;
    border: 1px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: inherit;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 6px;
    cursor: pointer;
}

.news-focus-btn:hover {
    background: var(--ink);
    color: var(--paper);
}
</style>
