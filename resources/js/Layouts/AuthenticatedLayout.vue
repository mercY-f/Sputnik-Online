<script setup>
import { ref } from 'vue';
import { Link } from '@inertiajs/vue3';
import MissionShell from '@/components/mission/MissionShell.vue';
import Dropdown from '@/Components/Dropdown.vue';
import DropdownLink from '@/Components/DropdownLink.vue';
import InstallPrompt from '@/Components/InstallPrompt.vue';
import { ChevronDown, Menu, X } from 'lucide-vue-next';

const showingNavigationDropdown = ref(false);
</script>

<template>
    <MissionShell class="min-h-screen">
        <!-- Topbar Left: Brand + Desktop Navigation Links -->
        <template #topbar-left>
            <div class="flex items-center gap-4">
                <!-- Branding -->
                <Link href="/" class="flex items-center gap-2.5 transition-opacity hover:opacity-85">
                    <span class="relative flex h-2 w-2">
                        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                        <span class="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span class="font-mono text-sm font-semibold uppercase tracking-widest text-foreground">
                        EARTH ORBIT LIVE
                    </span>
                    <span
                        class="hidden rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground xl:inline"
                    >
                        MISSION CONTROL
                    </span>
                </Link>

                <span class="hidden h-4 w-px bg-border/60 sm:block" />

                <!-- Desktop Navigation Links -->
                <nav class="hidden items-center gap-1.5 sm:flex">
                    <Link
                        href="/"
                        class="inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            $page.url === '/'
                                ? 'border-primary/50 bg-primary/10 text-primary font-semibold shadow-[0_0_8px] shadow-primary/20'
                                : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-secondary/60 hover:text-foreground'
                        "
                    >
                        🌍 Глобус
                    </Link>
                    <Link
                        :href="route('dashboard')"
                        class="inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            route().current('dashboard')
                                ? 'border-primary/50 bg-primary/10 text-primary font-semibold shadow-[0_0_8px] shadow-primary/20'
                                : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-secondary/60 hover:text-foreground'
                        "
                    >
                        Dashboard
                    </Link>
                    <Link
                        :href="route('alert-rules.index')"
                        class="inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            route().current('alert-rules.*')
                                ? 'border-primary/50 bg-primary/10 text-primary font-semibold shadow-[0_0_8px] shadow-primary/20'
                                : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-secondary/60 hover:text-foreground'
                        "
                    >
                        My Alerts
                    </Link>
                    <Link
                        v-if="$page.props.auth?.user?.role?.name === 'admin'"
                        :href="route('admin.satellites.index')"
                        class="inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            route().current('admin.satellites.*') || route().current('admin.dashboard')
                                ? 'border-primary/50 bg-primary/10 text-primary font-semibold shadow-[0_0_8px] shadow-primary/20'
                                : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-secondary/60 hover:text-foreground'
                        "
                    >
                        Manage Satellites
                    </Link>
                </nav>
            </div>
        </template>

        <!-- Topbar Center: Spacer -->
        <template #topbar-center>
            <div class="flex-1" />
        </template>

        <!-- Topbar Right: Clock UTC, LIVE indicator, User dropdown, Mobile toggle -->
        <template #topbar-right="{ clock }">
            <span class="font-mono text-xs tabular-nums text-foreground">{{ clock }} UTC</span>

            <span class="hidden h-4 w-px bg-border/60 sm:block" />

            <span class="flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/60" />
                <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">LIVE</span>
            </span>

            <span class="hidden h-4 w-px bg-border/60 sm:block" />

            <!-- User dropdown menu -->
            <div class="relative">
                <Dropdown align="right" width="48">
                    <template #trigger>
                        <button
                            type="button"
                            class="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/60 px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:border-border hover:bg-secondary"
                        >
                            <span
                                class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 font-mono text-[10px] font-bold uppercase text-primary border border-primary/30"
                            >
                                {{ $page.props.auth?.user?.name?.charAt(0)?.toUpperCase() }}
                            </span>
                            <span class="hidden max-w-[120px] truncate sm:inline">{{ $page.props.auth?.user?.name }}</span>
                            <ChevronDown class="h-3 w-3 text-muted-foreground" />
                        </button>
                    </template>

                    <template #content>
                        <div class="px-4 py-2 border-b border-border/40 font-mono text-[11px] text-muted-foreground truncate">
                            {{ $page.props.auth?.user?.name }}
                        </div>
                        <DropdownLink :href="route('profile.edit')">
                            Profile
                        </DropdownLink>
                        <DropdownLink :href="route('logout')" method="post" as="button">
                            Log Out
                        </DropdownLink>
                    </template>
                </Dropdown>
            </div>

            <!-- Hamburger mobile button (sm:hidden) -->
            <button
                @click="showingNavigationDropdown = !showingNavigationDropdown"
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded border border-border/60 bg-secondary/60 text-muted-foreground hover:text-foreground sm:hidden"
                aria-label="Навигация"
            >
                <Menu v-if="!showingNavigationDropdown" class="h-3.5 w-3.5" />
                <X v-else class="h-3.5 w-3.5" />
            </button>
        </template>

        <!-- Subheader & Mobile Navigation Menu -->
        <template #after-header>
            <!-- Mobile Navigation Dropdown -->
            <div
                v-show="showingNavigationDropdown"
                class="border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-xl sm:hidden font-mono text-xs space-y-1.5 shadow-xl"
            >
                <Link
                    href="/"
                    class="block px-3 py-2 rounded border transition-colors"
                    :class="
                        $page.url === '/'
                            ? 'border-primary/50 bg-primary/10 text-primary font-semibold'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    "
                >
                    🌍 Глобус
                </Link>
                <Link
                    :href="route('dashboard')"
                    class="block px-3 py-2 rounded border transition-colors"
                    :class="
                        route().current('dashboard')
                            ? 'border-primary/50 bg-primary/10 text-primary font-semibold'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    "
                >
                    Dashboard
                </Link>
                <Link
                    :href="route('alert-rules.index')"
                    class="block px-3 py-2 rounded border transition-colors"
                    :class="
                        route().current('alert-rules.*')
                            ? 'border-primary/50 bg-primary/10 text-primary font-semibold'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    "
                >
                    My Alerts
                </Link>
                <Link
                    v-if="$page.props.auth?.user?.role?.name === 'admin'"
                    :href="route('admin.satellites.index')"
                    class="block px-3 py-2 rounded border transition-colors"
                    :class="
                        route().current('admin.satellites.*') || route().current('admin.dashboard')
                            ? 'border-primary/50 bg-primary/10 text-primary font-semibold'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    "
                >
                    Manage Satellites
                </Link>
                <div class="my-2 border-t border-border/60 pt-2">
                    <Link
                        :href="route('profile.edit')"
                        class="block px-3 py-2 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    >
                        Profile ({{ $page.props.auth?.user?.name }})
                    </Link>
                    <Link
                        :href="route('logout')"
                        method="post"
                        as="button"
                        class="block w-full text-left px-3 py-2 rounded text-destructive hover:bg-destructive/10"
                    >
                        Log Out
                    </Link>
                </div>
            </div>

            <!-- Page Heading Subtitle ($slots.header) -->
            <header
                v-if="$slots.header"
                class="border-b border-border/40 bg-card/30 backdrop-blur-md px-4 py-4 sm:px-6 lg:px-8"
            >
                <div class="mx-auto max-w-7xl font-mono text-foreground">
                    <slot name="header" />
                </div>
            </header>
        </template>

        <!-- Main Content Wrapper (Point 7) -->
        <div class="mission-content max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <slot />
        </div>

        <InstallPrompt />
    </MissionShell>
</template>

<style scoped>
/* Header styling */
header :deep(h2),
header :deep(h1) {
    color: hsl(var(--foreground)) !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
    font-size: 1.125rem !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em !important;
}

/* ========================================================
   Mission Control CSS Bridge for Breeze / Internal Pages
   ======================================================== */

.mission-content {
    color: hsl(var(--foreground));
}

/* 1. Surfaces & Cards (.bg-white, .bg-gray-50, etc.) */
:deep(.bg-white) {
    background-color: hsl(var(--card) / 0.75) !important;
    border: 1px solid hsl(var(--border) / 0.6) !important;
    color: hsl(var(--foreground)) !important;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.4), 0 0 1px 1px hsl(var(--border) / 0.4) !important;
}

/* Muted / secondary containers */
:deep(.bg-gray-50),
:deep(.bg-gray-100) {
    background-color: hsl(var(--secondary) / 0.5) !important;
    border-color: hsl(var(--border) / 0.6) !important;
    color: hsl(var(--foreground)) !important;
}

:deep(.bg-gray-200) {
    background-color: hsl(var(--secondary) / 0.8) !important;
}

/* 2. Typography overrides */
:deep(.text-gray-900),
:deep(.text-gray-800) {
    color: hsl(var(--foreground)) !important;
}

:deep(.text-gray-700),
:deep(.text-gray-600),
:deep(.text-gray-500),
:deep(.text-gray-400) {
    color: hsl(var(--muted-foreground)) !important;
}

/* 3. Borders & Dividers */
:deep(.border-gray-100),
:deep(.border-gray-200),
:deep(.border-gray-300),
:deep(.divide-gray-100 > * + *),
:deep(.divide-gray-200 > * + *),
:deep(.divide-gray-300 > * + *),
:deep(.divide-gray-200 > :not([hidden]) ~ :not([hidden])) {
    border-color: hsl(var(--border) / 0.6) !important;
}

/* 4. Alert / Info Card (.bg-indigo-50, .text-indigo-*) */
:deep(.bg-indigo-50) {
    background-color: hsl(var(--primary) / 0.1) !important;
    border: 1px solid hsl(var(--primary) / 0.25) !important;
    color: hsl(var(--foreground)) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

:deep(.text-indigo-900),
:deep(.text-indigo-800),
:deep(.text-indigo-700) {
    color: hsl(var(--foreground)) !important;
}

:deep(.text-indigo-600),
:deep(.text-indigo-500) {
    color: hsl(var(--primary)) !important;
}

:deep(.hover\:text-indigo-900:hover),
:deep([class*="hover:text-indigo-900"]:hover) {
    color: hsl(var(--primary) / 0.8) !important;
}

:deep(.border-indigo-200),
:deep(.border-indigo-300),
:deep(.border-indigo-400),
:deep(.border-indigo-500) {
    border-color: hsl(var(--primary) / 0.35) !important;
}

/* 5. Inputs, Selects, Textareas */
:deep(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
:deep(select),
:deep(textarea) {
    background-color: hsl(var(--secondary) / 0.5) !important;
    border: 1px solid hsl(var(--border)) !important;
    color: hsl(var(--foreground)) !important;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
}

:deep(input:focus),
:deep(select:focus),
:deep(textarea:focus) {
    border-color: hsl(var(--primary)) !important;
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2) !important;
    outline: none !important;
}

:deep(select option) {
    background-color: hsl(var(--card)) !important;
    color: hsl(var(--foreground)) !important;
}

:deep(input[type="range"]) {
    background-color: hsl(var(--secondary)) !important;
    accent-color: hsl(var(--primary)) !important;
}

/* 6. Buttons & Links */
:deep(button.bg-white),
:deep(a.bg-white) {
    background-color: hsl(var(--secondary) / 0.6) !important;
    border: 1px solid hsl(var(--border)) !important;
    color: hsl(var(--foreground)) !important;
}

:deep(button.bg-white:hover),
:deep(a.bg-white:hover) {
    background-color: hsl(var(--secondary)) !important;
    border-color: hsl(var(--border) / 0.8) !important;
}

:deep([class*="bg-indigo-600"]),
:deep([class*="bg-indigo-700"]) {
    background-color: hsl(var(--primary)) !important;
    color: hsl(var(--primary-foreground)) !important;
    font-weight: 600;
}

:deep([class*="hover:bg-indigo-700"]:hover) {
    background-color: hsl(var(--primary) / 0.85) !important;
}

:deep([class*="bg-red-600"]) {
    background-color: hsl(var(--destructive)) !important;
    color: hsl(var(--destructive-foreground)) !important;
}

:deep([class*="hover:bg-red-700"]:hover) {
    background-color: hsl(var(--destructive) / 0.85) !important;
}

:deep([class*="text-red-500"]) {
    color: hsl(var(--destructive)) !important;
}

:deep([class*="hover:text-red-700"]:hover) {
    color: hsl(var(--destructive) / 0.8) !important;
}

:deep(.bg-gray-200.text-gray-800) {
    background-color: hsl(var(--secondary)) !important;
    color: hsl(var(--foreground)) !important;
    border: 1px solid hsl(var(--border) / 0.8) !important;
}

:deep([class*="hover:bg-gray-300"]:hover) {
    background-color: hsl(var(--accent)) !important;
}

/* 7. Tables */
:deep(table) {
    background-color: transparent !important;
    border-color: hsl(var(--border) / 0.6) !important;
}

:deep(table thead tr) {
    border-bottom: 1px solid hsl(var(--border) / 0.6) !important;
}

:deep(table th) {
    color: hsl(var(--muted-foreground)) !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    font-size: 0.75rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    background-color: hsl(var(--card) / 0.5) !important;
    border-bottom: 1px solid hsl(var(--border) / 0.6) !important;
}

:deep(table tbody tr) {
    border-bottom: 1px solid hsl(var(--border) / 0.4) !important;
    transition: background-color 0.15s;
}

:deep(table tbody tr:hover) {
    background-color: hsl(var(--secondary) / 0.4) !important;
}

:deep(table td) {
    color: hsl(var(--foreground)) !important;
}

/* 8. Badges, Flash messages & Pagination */
:deep(.bg-blue-100) {
    background-color: hsl(var(--primary) / 0.15) !important;
    color: hsl(var(--primary)) !important;
    border: 1px solid hsl(var(--primary) / 0.3) !important;
}

:deep(.text-blue-800) {
    color: hsl(var(--primary)) !important;
}

:deep(.bg-green-100) {
    background-color: rgba(16, 185, 129, 0.15) !important;
    color: #34d399 !important;
    border: 1px solid rgba(16, 185, 129, 0.3) !important;
}

:deep(.text-green-800),
:deep(.text-green-700) {
    color: #34d399 !important;
}

:deep(.text-green-600) {
    color: #10b981 !important;
}

:deep(.border-green-400) {
    border-color: rgba(16, 185, 129, 0.4) !important;
}

:deep(.border-dashed) {
    border-style: dashed !important;
    border-color: hsl(var(--border) / 0.6) !important;
}

:deep(code) {
    background-color: hsl(var(--secondary)) !important;
    color: hsl(var(--foreground)) !important;
    border: 1px solid hsl(var(--border) / 0.6);
}

:deep(.border-t.border-gray-200.bg-white) {
    background-color: transparent !important;
    border-color: hsl(var(--border) / 0.6) !important;
}

:deep(nav[aria-label="Pagination"]) {
    border-radius: 0.375rem;
    overflow: hidden;
    box-shadow: none !important;
}

:deep(nav[aria-label="Pagination"] > *) {
    background-color: hsl(var(--secondary) / 0.6) !important;
    border-color: hsl(var(--border)) !important;
    color: hsl(var(--foreground)) !important;
}

:deep(nav[aria-label="Pagination"] > [class*="bg-indigo-600"]) {
    background-color: hsl(var(--primary)) !important;
    color: hsl(var(--primary-foreground)) !important;
    border-color: hsl(var(--primary)) !important;
}

:deep(nav[aria-label="Pagination"] > [class*="hover:bg-gray-50"]:hover) {
    background-color: hsl(var(--secondary)) !important;
    color: hsl(var(--foreground)) !important;
}

:deep(nav[aria-label="Pagination"] > [class*="text-gray-400"]) {
    color: hsl(var(--muted-foreground) / 0.5) !important;
}
</style>
