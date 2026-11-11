<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps({
    objectCount: {
        type: Number,
        default: 0,
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
    <div :class="cn('relative flex min-h-screen flex-col bg-background text-foreground', props.class)">
        <header
            class="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border/60 bg-card/50 px-4 backdrop-blur-xl"
        >
            <slot name="topbar-left">
                <div class="flex items-center gap-2.5">
                    <span class="relative flex h-2 w-2">
                        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                        <span class="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span class="font-mono text-sm uppercase tracking-widest text-foreground">
                        EARTH ORBIT LIVE
                    </span>
                    <span
                        class="hidden rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground md:inline"
                    >
                        MISSION CONTROL
                    </span>
                </div>
            </slot>

            <slot name="topbar-center">
                <div class="hidden flex-1 justify-center md:flex">
                    <div
                        class="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 text-muted-foreground transition-colors hover:border-border"
                    >
                        <Search class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate text-xs">Поиск спутника или команда…</span>
                        <kbd
                            class="ml-auto rounded border border-border/60 bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                            ⌘K
                        </kbd>
                    </div>
                </div>
            </slot>

            <div class="ml-auto flex items-center gap-3 md:ml-0">
                <slot name="topbar-right" :clock="clock" :object-total="objectTotal">
                    <span class="font-mono text-xs tabular-nums text-foreground">{{ clock }} UTC</span>

                    <span class="hidden h-4 w-px bg-border/60 sm:block" />

                    <span class="hidden items-center gap-1.5 sm:flex">
                        <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                            OBJ
                        </span>
                        <span class="font-mono text-xs tabular-nums text-foreground">{{ objectTotal }}</span>
                    </span>

                    <span class="flex items-center gap-1.5">
                        <span class="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/60" />
                        <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">LIVE</span>
                    </span>

                    <span
                        class="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-secondary font-mono text-[11px] uppercase text-foreground"
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

        <footer class="border-t border-border/60 bg-card/30 px-4 py-3 backdrop-blur-xl">
            <slot name="footer" :clock="clock">
                <div
                    class="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
                >
                    <span>Earth Orbit Live — Mission Control</span>
                    <span class="tabular-nums">{{ clock }} UTC</span>
                </div>
            </slot>
        </footer>
    </div>
</template>
