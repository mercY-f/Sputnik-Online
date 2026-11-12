<script setup>
import { computed, ref } from 'vue';
import { Radar } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

const badgeClass = computed(() => {
    switch (props.item.category) {
        case 'launch':
            return 'border-primary/30 bg-primary/10 text-primary';
        case 'science':
            return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300';
        case 'discovery':
            return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
        default:
            return 'border-border/60 bg-secondary text-muted-foreground';
    }
});

const dotClass = computed(() => {
    switch (props.item.category) {
        case 'launch':
            return 'bg-primary shadow-[0_0_6px] shadow-primary/60';
        case 'science':
            return 'bg-cyan-400 shadow-[0_0_6px] shadow-cyan-400/60';
        case 'discovery':
            return 'bg-amber-400 shadow-[0_0_6px] shadow-amber-400/60';
        default:
            return 'bg-muted-foreground';
    }
});

const label = computed(() => categoryLabels[props.item.category] ?? props.item.category);

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
        role="button"
        tabindex="0"
        :aria-expanded="expanded"
        :class="
            cn(
                'group relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card/70 p-3 backdrop-blur-xl',
                'transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/90',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )
        "
        @click="toggle"
        @keydown.enter.self="toggle"
        @keydown.space.prevent="toggle"
    >
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        />

        <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
                <span class="h-2 w-2 shrink-0 rounded-full" :class="dotClass" />
                <Badge v-if="expanded" variant="outline" :class="badgeClass">
                    {{ label }}
                </Badge>
            </div>
            <span class="shrink-0 font-mono text-[10px] uppercase tracking-wider tabular-nums text-muted-foreground">
                {{ formattedTime }}
            </span>
        </div>

        <h3 :class="cn('mt-1.5 text-xs font-medium leading-snug text-foreground', !expanded && 'line-clamp-2')">
            {{ item.title }}
        </h3>

        <div v-if="expanded" class="mt-2.5 space-y-2.5">
            <p class="text-xs leading-relaxed text-muted-foreground">
                {{ item.summary }}
            </p>

            <div class="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {{ item.source }}
                </span>
                <Button
                    v-if="item.satellite?.catalogNumber"
                    variant="outline"
                    size="sm"
                    class="h-7 gap-1.5 border-border/60 bg-transparent px-2.5 font-mono text-[10px] uppercase tracking-wider hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    @click.stop="emitFocus"
                    @keydown.enter.stop="emitFocus"
                    @keydown.space.stop="emitFocus"
                >
                    <Radar class="h-3 w-3" />
                    Найти на орбите
                </Button>
            </div>
        </div>
    </article>
</template>
