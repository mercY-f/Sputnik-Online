<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps({
    objectCount: {
        type: Number,
        default: 0,
    },
    hideFooter: {
        type: Boolean,
        default: false,
    },
    class: {
        type: null,
        default: undefined,
    },
});

const clock = ref('--:--:--');
const objectTotal = ref('00000');

let timer = null;

function pad(value, size = 2) {
    return String(value).padStart(size, '0');
}

function tick() {
    const now = new Date();

    clock.value = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
    objectTotal.value = pad(props.objectCount, 5);
}

onMounted(() => {
    tick();
    timer = setInterval(tick, 1000);
});

onUnmounted(() => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
});
</script>

<template>
    <div :class="cn('relative flex min-h-screen flex-col bg-paper text-ink', props.class)">
        <header
            class="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-ink bg-paper px-4"
        >
            <slot name="topbar-left">
                <div class="flex items-center gap-2.5">
                    <span class="relative flex h-2 w-2">
                        <span class="absolute inline-flex h-full w-full animate-ping bg-ink" />
                        <span class="relative inline-flex h-2 w-2 bg-ink" />
                    </span>
                    <span class="font-mono text-sm uppercase tracking-widest text-ink">
                        EARTH ORBIT LIVE
                    </span>
                    <span
                        class="hidden border border-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted md:inline"
                    >
                        MISSION CONTROL
                    </span>
                </div>
            </slot>

            <slot name="topbar-center">
                <div class="hidden flex-1 justify-center md:flex">
                    <div
                        class="flex h-8 w-full max-w-sm items-center gap-2 border border-ink bg-surface px-3 text-ink-muted transition-colors"
                    >
                        <Search class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate text-xs">Поиск спутника или команда…</span>
                        <kbd
                            class="ml-auto border border-ink bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
                        >
                            ⌘K
                        </kbd>
                    </div>
                </div>
            </slot>

            <div class="ml-auto flex items-center gap-3 md:ml-0">
                <slot name="topbar-right" :clock="clock" :object-total="objectTotal">
                    <span class="font-mono text-xs tabular-nums text-ink">{{ clock }} UTC</span>

                    <span class="hidden h-4 w-px bg-ink sm:block" />

                    <span class="hidden items-center gap-1.5 sm:flex">
                        <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">
                            OBJ
                        </span>
                        <span class="font-mono text-xs tabular-nums text-ink">{{ objectTotal }}</span>
                    </span>

                    <span class="flex items-center gap-1.5">
                        <span class="h-1.5 w-1.5 bg-ink" />
                        <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-ink">LIVE</span>
                    </span>

                    <span
                        class="flex h-7 w-7 items-center justify-center border border-ink bg-surface font-mono text-[11px] uppercase text-ink"
                    >
                        M
                    </span>
                </slot>
            </div>
        </header>

        <slot name="after-header" />

        <main class="relative flex-1">
            <slot />
        </main>

        <footer v-if="!hideFooter" class="border-t border-ink bg-surface px-4 py-3">
            <slot name="footer" :clock="clock">
                <div
                    class="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted"
                >
                    <span>Earth Orbit Live — Mission Control</span>
                    <span class="tabular-nums">{{ clock }} UTC</span>
                </div>
            </slot>
        </footer>
    </div>
</template>
