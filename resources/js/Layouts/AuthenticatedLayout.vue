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
                <Link href="/" class="flex items-center gap-2.5 transition-opacity hover:opacity-80">
                    <span class="relative flex h-2 w-2">
                        <span class="absolute inline-flex h-full w-full animate-ping bg-ink" />
                        <span class="relative inline-flex h-2 w-2 bg-ink" />
                    </span>
                    <span class="font-mono text-sm font-semibold uppercase tracking-widest text-ink">
                        EARTH ORBIT LIVE
                    </span>
                    <span
                        class="hidden border border-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted xl:inline"
                    >
                        MISSION CONTROL
                    </span>
                </Link>

                <span class="hidden h-4 w-px bg-ink sm:block" />

                <!-- Desktop Navigation Links -->
                <nav class="hidden items-center gap-1.5 sm:flex">
                    <Link
                        href="/"
                        class="inline-flex items-center border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            $page.url === '/'
                                ? 'border-ink bg-ink text-paper font-semibold'
                                : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                        "
                    >
                        🌍 Глобус
                    </Link>
                    <Link
                        :href="route('dashboard')"
                        class="inline-flex items-center border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            route().current('dashboard')
                                ? 'border-ink bg-ink text-paper font-semibold'
                                : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                        "
                    >
                        Dashboard
                    </Link>
                    <Link
                        :href="route('alert-rules.index')"
                        class="inline-flex items-center border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            route().current('alert-rules.*')
                                ? 'border-ink bg-ink text-paper font-semibold'
                                : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                        "
                    >
                        My Alerts
                    </Link>
                    <Link
                        v-if="$page.props.auth?.user?.role?.name === 'admin'"
                        :href="route('admin.satellites.index')"
                        class="inline-flex items-center border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"
                        :class="
                            route().current('admin.satellites.*') || route().current('admin.dashboard')
                                ? 'border-ink bg-ink text-paper font-semibold'
                                : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
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
            <span class="font-mono text-xs tabular-nums text-ink">{{ clock }} UTC</span>

            <span class="hidden h-4 w-px bg-ink sm:block" />

            <span class="flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 bg-ink" />
                <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-ink">LIVE</span>
            </span>

            <span class="hidden h-4 w-px bg-ink sm:block" />

            <!-- User dropdown menu -->
            <div class="relative">
                <Dropdown align="right" width="48">
                    <template #trigger>
                        <button
                            type="button"
                            class="flex items-center gap-2 border border-ink bg-surface px-2.5 py-1 font-mono text-xs text-ink transition-colors hover:bg-paper"
                        >
                            <span
                                class="flex h-5 w-5 items-center justify-center border border-ink bg-ink font-mono text-[10px] font-bold uppercase text-paper"
                            >
                                {{ $page.props.auth?.user?.name?.charAt(0)?.toUpperCase() }}
                            </span>
                            <span class="hidden max-w-[120px] truncate sm:inline">{{ $page.props.auth?.user?.name }}</span>
                            <ChevronDown class="h-3 w-3 text-ink-muted" />
                        </button>
                    </template>

                    <template #content>
                        <div class="border-b border-ink px-4 py-2 font-mono text-[11px] text-ink-muted truncate">
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
                class="flex h-7 w-7 items-center justify-center border border-ink bg-surface text-ink hover:bg-paper sm:hidden"
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
                class="border-b border-ink bg-paper px-4 py-3 font-mono text-xs space-y-1.5 sm:hidden"
            >
                <Link
                    href="/"
                    class="block border px-3 py-2 transition-colors"
                    :class="
                        $page.url === '/'
                            ? 'border-ink bg-ink text-paper font-semibold'
                            : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                    "
                >
                    🌍 Глобус
                </Link>
                <Link
                    :href="route('dashboard')"
                    class="block border px-3 py-2 transition-colors"
                    :class="
                        route().current('dashboard')
                            ? 'border-ink bg-ink text-paper font-semibold'
                            : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                    "
                >
                    Dashboard
                </Link>
                <Link
                    :href="route('alert-rules.index')"
                    class="block border px-3 py-2 transition-colors"
                    :class="
                        route().current('alert-rules.*')
                            ? 'border-ink bg-ink text-paper font-semibold'
                            : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                    "
                >
                    My Alerts
                </Link>
                <Link
                    v-if="$page.props.auth?.user?.role?.name === 'admin'"
                    :href="route('admin.satellites.index')"
                    class="block border px-3 py-2 transition-colors"
                    :class="
                        route().current('admin.satellites.*') || route().current('admin.dashboard')
                            ? 'border-ink bg-ink text-paper font-semibold'
                            : 'border-transparent text-ink-muted hover:border-ink hover:bg-surface hover:text-ink'
                    "
                >
                    Manage Satellites
                </Link>
                <div class="my-2 border-t border-ink pt-2">
                    <Link
                        :href="route('profile.edit')"
                        class="block border border-transparent px-3 py-2 text-ink-muted transition-colors hover:border-ink hover:bg-surface hover:text-ink"
                    >
                        Profile ({{ $page.props.auth?.user?.name }})
                    </Link>
                    <Link
                        :href="route('logout')"
                        method="post"
                        as="button"
                        class="block w-full border border-ink px-3 py-2 text-left text-ink transition-colors hover:bg-ink hover:text-paper"
                    >
                        Log Out
                    </Link>
                </div>
            </div>

            <!-- Page Heading Subtitle ($slots.header) -->
            <header
                v-if="$slots.header"
                class="border-b border-ink bg-surface px-4 py-4 sm:px-6 lg:px-8"
            >
                <div class="mx-auto max-w-7xl font-mono text-ink">
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
    color: var(--ink) !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
    font-size: 1.125rem !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em !important;
}

/* ========================================================
   1-bit CSS Bridge for Breeze / Internal Pages
   ======================================================== */

.mission-content {
    color: var(--ink);
}

/* 1. Surfaces & Cards (.bg-white, .bg-gray-50, etc.) */
:deep(.bg-white) {
    background-color: var(--paper) !important;
    border: 1px solid var(--ink) !important;
    color: var(--ink) !important;
    box-shadow: var(--shadow-hard) !important;
}

:deep(.bg-gray-50),
:deep(.bg-gray-100) {
    background-color: var(--surface) !important;
    border-color: var(--ink) !important;
    color: var(--ink) !important;
}

:deep(.bg-gray-200) {
    background-color: var(--surface) !important;
}

/* 2. Typography overrides */
:deep(.text-gray-900),
:deep(.text-gray-800) {
    color: var(--ink) !important;
}

:deep(.text-gray-700),
:deep(.text-gray-600),
:deep(.text-gray-500),
:deep(.text-gray-400) {
    color: var(--ink-muted) !important;
}

/* 3. Borders & Dividers */
:deep(.border-gray-100),
:deep(.border-gray-200),
:deep(.border-gray-300),
:deep(.divide-gray-100 > * + *),
:deep(.divide-gray-200 > * + *),
:deep(.divide-gray-300 > * + *),
:deep(.divide-gray-200 > :not([hidden]) ~ :not([hidden])) {
    border-color: var(--ink) !important;
}

/* 4. Alert / Info Card (.bg-indigo-50, .text-indigo-*) */
:deep(.bg-indigo-50) {
    background-color: var(--surface) !important;
    border: 1px solid var(--ink) !important;
    color: var(--ink) !important;
}

:deep(.text-indigo-900),
:deep(.text-indigo-800),
:deep(.text-indigo-700) {
    color: var(--ink) !important;
}

:deep(.text-indigo-600),
:deep(.text-indigo-500) {
    color: var(--ink) !important;
}

:deep(.hover\:text-indigo-900:hover),
:deep([class*="hover:text-indigo-900"]:hover) {
    color: var(--ink-muted) !important;
}

:deep(.border-indigo-200),
:deep(.border-indigo-300),
:deep(.border-indigo-400),
:deep(.border-indigo-500) {
    border-color: var(--ink) !important;
}

/* 5. Inputs, Selects, Textareas */
:deep(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
:deep(select),
:deep(textarea) {
    background-color: var(--paper) !important;
    border: 1px solid var(--ink) !important;
    color: var(--ink) !important;
    transition: background-color 0.15s ease;
}

:deep(input::placeholder),
:deep(textarea::placeholder) {
    color: var(--ink-muted) !important;
}

:deep(input:focus),
:deep(select:focus),
:deep(textarea:focus) {
    background-color: var(--surface) !important;
    border-color: var(--ink) !important;
    outline: 2px solid var(--ink) !important;
    outline-offset: 1px;
    box-shadow: none !important;
}

:deep(select option) {
    background-color: var(--paper) !important;
    color: var(--ink) !important;
}

:deep(input[type="range"]) {
    background-color: var(--surface) !important;
    accent-color: var(--ink) !important;
}

/* 6. Buttons & Links */
:deep(button.bg-white),
:deep(a.bg-white) {
    background-color: var(--paper) !important;
    border: 1px solid var(--ink) !important;
    color: var(--ink) !important;
}

:deep(button.bg-white:hover),
:deep(a.bg-white:hover) {
    background-color: var(--surface) !important;
    border-color: var(--ink) !important;
}

:deep([class*="bg-indigo-600"]),
:deep([class*="bg-indigo-700"]) {
    background-color: var(--ink) !important;
    color: var(--paper) !important;
    font-weight: 600;
}

:deep([class*="hover:bg-indigo-700"]:hover) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
}

:deep([class*="bg-red-600"]),
:deep([class*="bg-red-500"]) {
    background-color: var(--ink) !important;
    color: var(--paper) !important;
    border: 1px solid var(--ink) !important;
}

:deep([class*="hover:bg-red-700"]:hover),
:deep([class*="hover:bg-red-500"]:hover) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
}

:deep([class*="text-red-500"]),
:deep([class*="text-red-600"]) {
    color: var(--ink) !important;
}

:deep([class*="hover:text-red-700"]:hover) {
    color: var(--ink-muted) !important;
}

:deep(.bg-gray-200.text-gray-800) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
    border: 1px solid var(--ink) !important;
}

:deep([class*="hover:bg-gray-300"]:hover) {
    background-color: var(--surface) !important;
}

/* 7. Tables */
:deep(table) {
    background-color: transparent !important;
    border-color: var(--ink) !important;
}

:deep(table thead tr) {
    border-bottom: 1px solid var(--ink) !important;
}

:deep(table th) {
    color: var(--ink-muted) !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    font-size: 0.75rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    background-color: var(--surface) !important;
    border-bottom: 1px solid var(--ink) !important;
}

:deep(table tbody tr) {
    border-bottom: 1px solid var(--ink) !important;
    transition: background-color 0.15s;
}

:deep(table tbody tr:hover) {
    background-color: var(--surface) !important;
}

:deep(table td) {
    color: var(--ink) !important;
}

/* 8. Badges, Flash messages & Pagination */
:deep(.bg-blue-100) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
    border: 1px solid var(--ink) !important;
}

:deep(.text-blue-800) {
    color: var(--ink) !important;
}

:deep(.bg-green-100) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
    border: 1px solid var(--ink) !important;
}

:deep(.text-green-800),
:deep(.text-green-700),
:deep(.text-green-600) {
    color: var(--ink) !important;
}

:deep(.border-green-400) {
    border-color: var(--ink) !important;
}

:deep(.border-dashed) {
    border-style: dashed !important;
    border-color: var(--ink) !important;
}

:deep(code) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
    border: 1px solid var(--ink);
}

:deep(.border-t.border-gray-200.bg-white) {
    background-color: transparent !important;
    border-color: var(--ink) !important;
}

:deep(nav[aria-label="Pagination"]) {
    border-radius: 0;
    overflow: hidden;
    box-shadow: none !important;
}

:deep(nav[aria-label="Pagination"] > *) {
    background-color: var(--paper) !important;
    border-color: var(--ink) !important;
    color: var(--ink) !important;
}

:deep(nav[aria-label="Pagination"] > [class*="bg-indigo-600"]) {
    background-color: var(--ink) !important;
    color: var(--paper) !important;
    border-color: var(--ink) !important;
}

:deep(nav[aria-label="Pagination"] > [class*="hover:bg-gray-50"]:hover) {
    background-color: var(--surface) !important;
    color: var(--ink) !important;
}

:deep(nav[aria-label="Pagination"] > [class*="text-gray-400"]) {
    color: var(--ink-muted) !important;
}
</style>
