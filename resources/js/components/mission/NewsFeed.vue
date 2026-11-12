<script setup>
import { computed, ref } from 'vue';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
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

const collapsed = ref(true);

function toggle() {
    collapsed.value = !collapsed.value;
}

function onFocus(catalogNumber) {
    emit('focus', catalogNumber);
}
</script>

<template>
    <section :class="cn('flex flex-col', props.class)">
        <div
            :class="
                cn(
                    'flex cursor-pointer select-none items-center justify-between gap-3',
                    !collapsed && 'mb-3',
                )
            "
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed"
            @click="toggle"
            @keydown.enter="toggle"
            @keydown.space.prevent="toggle"
        >
            <div class="flex items-center gap-2">
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <h2 class="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {{ title }}
                </h2>
                <span class="font-mono text-[11px] leading-none text-primary">*</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-mono text-[11px] uppercase tracking-[0.15em] tabular-nums text-muted-foreground">
                    {{ count }}
                </span>
                <ChevronDown v-if="collapsed" class="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                <ChevronUp v-else class="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            </div>
        </div>

        <div v-show="!collapsed" class="min-h-0">
            <ScrollArea :style="{ maxHeight: maxHeight }" class="news-scroll-area pr-3 [&>div]:max-h-[inherit]">
                <div v-if="items.length" class="flex flex-col gap-2 pb-1">
                    <NewsCard
                        v-for="item in items"
                        :key="item.id"
                        :item="item"
                        @focus="onFocus"
                    />
                </div>
                <div
                    v-else
                    class="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
                >
                    Нет событий
                </div>
            </ScrollArea>
        </div>
    </section>
</template>
