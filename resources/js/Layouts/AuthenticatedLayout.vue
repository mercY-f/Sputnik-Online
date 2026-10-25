<script setup>
import { ref } from 'vue';
import ApplicationLogo from '@/Components/ApplicationLogo.vue';
import Dropdown from '@/Components/Dropdown.vue';
import DropdownLink from '@/Components/DropdownLink.vue';
import NavLink from '@/Components/NavLink.vue';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink.vue';
import InstallPrompt from '@/Components/InstallPrompt.vue';
import { Link } from '@inertiajs/vue3';

const showingNavigationDropdown = ref(false);
</script>

<template>
    <div>
        <div class="app-layout">
            <nav class="app-nav">
                <div class="nav-container">
                    <div class="nav-inner">
                        <!-- Logo + Brand -->
                        <div class="nav-left">
                            <div class="nav-logo-wrap">
                                <Link :href="route('dashboard')" class="nav-brand">
                                    <ApplicationLogo class="nav-logo-icon" />
                                    <span class="nav-brand-text">Orbit<span class="nav-brand-accent">Track</span></span>
                                </Link>
                            </div>

                            <!-- Desktop Navigation Links -->
                            <div class="nav-links">
                                <NavLink
                                    :href="route('dashboard')"
                                    :active="route().current('dashboard')"
                                >
                                    Dashboard
                                </NavLink>
                                <NavLink
                                    :href="route('alert-rules.index')"
                                    :active="route().current('alert-rules.*')"
                                >
                                    My Alerts
                                </NavLink>
                                <NavLink
                                    v-if="$page.props.auth.user.role?.name === 'admin'"
                                    :href="route('admin.satellites.index')"
                                    :active="route().current('admin.satellites.*')"
                                >
                                    Manage Satellites
                                </NavLink>
                            </div>
                        </div>

                        <!-- Right side -->
                        <div class="nav-right">
                            <!-- Settings Dropdown -->
                            <div class="nav-user">
                                <Dropdown align="right" width="48">
                                    <template #trigger>
                                        <span class="inline-flex rounded-md">
                                            <button
                                                type="button"
                                                class="nav-user-btn"
                                            >
                                                <!-- User avatar circle -->
                                                <span class="nav-avatar">
                                                    {{ $page.props.auth.user.name?.charAt(0)?.toUpperCase() }}
                                                </span>
                                                {{ $page.props.auth.user.name }}

                                                <svg
                                                    class="ms-2 h-4 w-4 opacity-60"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
                                                >
                                                    <path
                                                        fill-rule="evenodd"
                                                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                                        clip-rule="evenodd"
                                                    />
                                                </svg>
                                            </button>
                                        </span>
                                    </template>

                                    <template #content>
                                        <DropdownLink :href="route('profile.edit')">
                                            Profile
                                        </DropdownLink>
                                        <DropdownLink
                                            :href="route('logout')"
                                            method="post"
                                            as="button"
                                        >
                                            Log Out
                                        </DropdownLink>
                                    </template>
                                </Dropdown>
                            </div>
                        </div>

                        <!-- Hamburger (mobile) -->
                        <div class="nav-hamburger">
                            <button
                                @click="showingNavigationDropdown = !showingNavigationDropdown"
                                class="hamburger-btn"
                            >
                                <svg
                                    class="h-6 w-6"
                                    stroke="currentColor"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        :class="{
                                            hidden: showingNavigationDropdown,
                                            'inline-flex': !showingNavigationDropdown,
                                        }"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M4 6h16M4 12h16M4 18h16"
                                    />
                                    <path
                                        :class="{
                                            hidden: !showingNavigationDropdown,
                                            'inline-flex': showingNavigationDropdown,
                                        }"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Responsive Navigation Menu -->
                <div
                    :class="{
                        block: showingNavigationDropdown,
                        hidden: !showingNavigationDropdown,
                    }"
                    class="sm:hidden nav-mobile-menu"
                >
                    <div class="space-y-1 pb-3 pt-2">
                        <ResponsiveNavLink
                            :href="route('dashboard')"
                            :active="route().current('dashboard')"
                        >
                            Dashboard
                        </ResponsiveNavLink>
                        <ResponsiveNavLink
                            :href="route('alert-rules.index')"
                            :active="route().current('alert-rules.*')"
                        >
                            My Alerts
                        </ResponsiveNavLink>
                        <ResponsiveNavLink
                            v-if="$page.props.auth.user.role?.name === 'admin'"
                            :href="route('admin.satellites.index')"
                            :active="route().current('admin.satellites.*')"
                        >
                            Manage Satellites
                        </ResponsiveNavLink>
                    </div>

                    <!-- Responsive Settings Options -->
                    <div class="border-t border-white/10 pb-1 pt-4">
                        <div class="px-4">
                            <div class="text-base font-medium text-gray-100">
                                {{ $page.props.auth.user.name }}
                            </div>
                            <div class="text-sm font-medium text-gray-400">
                                {{ $page.props.auth.user.email }}
                            </div>
                        </div>

                        <div class="mt-3 space-y-1">
                            <ResponsiveNavLink :href="route('profile.edit')">
                                Profile
                            </ResponsiveNavLink>
                            <ResponsiveNavLink
                                :href="route('logout')"
                                method="post"
                                as="button"
                            >
                                Log Out
                            </ResponsiveNavLink>
                        </div>
                    </div>
                </div>
            </nav>

            <!-- Page Heading -->
            <header
                class="app-page-header"
                v-if="$slots.header"
            >
                <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
                    <slot name="header" />
                </div>
            </header>

            <!-- Page Content -->
            <main>
                <slot />
            </main>
        </div>
        <InstallPrompt />
    </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* Layout */
.app-layout {
    min-height: 100vh;
    background: #f1f5f9;
    font-family: 'Inter', system-ui, sans-serif;
}

/* Navigation */
.app-nav {
    background: #0f172a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 1px 20px rgba(0, 0, 0, 0.3);
    position: sticky;
    top: 0;
    z-index: 100;
}

.nav-container {
    max-width: 80rem;
    margin: 0 auto;
    padding: 0 1rem;
}
@media (min-width: 640px) { .nav-container { padding: 0 1.5rem; } }
@media (min-width: 1024px) { .nav-container { padding: 0 2rem; } }

.nav-inner {
    display: flex;
    height: 4rem;
    align-items: center;
    justify-content: space-between;
}

.nav-left {
    display: flex;
    align-items: center;
    gap: 0;
}

/* Brand / Logo */
.nav-brand {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    text-decoration: none;
    margin-right: 2rem;
    transition: opacity 0.2s;
}
.nav-brand:hover { opacity: 0.85; }

.nav-logo-icon {
    width: 28px;
    height: 28px;
    color: #60a5fa;
}

.nav-brand-text {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f0f6ff;
    letter-spacing: -0.3px;
}
.nav-brand-accent {
    color: #60a5fa;
}

/* Desktop nav links */
.nav-links {
    display: none;
    gap: 0.25rem;
    align-items: center;
    margin-left: 0.5rem;
}
@media (min-width: 640px) {
    .nav-links { display: flex; }
}

/* Override NavLink styles for dark navbar */
.nav-links :deep(a) {
    color: #94a3b8;
    border-bottom: 2px solid transparent;
    padding: 0 0.75rem;
    height: 4rem;
    display: inline-flex;
    align-items: center;
    font-size: 0.875rem;
    font-weight: 500;
    transition: color 0.2s;
    text-decoration: none;
}
.nav-links :deep(a:hover) {
    color: #e2e8f0;
    border-color: rgba(96, 165, 250, 0.4);
}
.nav-links :deep(a.border-indigo-400),
.nav-links :deep(a[class*="border-indigo"]) {
    color: #60a5fa;
    border-color: #60a5fa;
}

/* Right side */
.nav-right {
    display: none;
    align-items: center;
}
@media (min-width: 640px) {
    .nav-right { display: flex; }
}

.nav-user-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
    color: #cbd5e1;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    font-family: inherit;
}
.nav-user-btn:hover {
    background: rgba(255, 255, 255, 0.09);
    border-color: rgba(255, 255, 255, 0.18);
    color: #f0f6ff;
}

.nav-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

/* Hamburger (mobile) */
.nav-hamburger {
    display: flex;
    align-items: center;
}
@media (min-width: 640px) { .nav-hamburger { display: none; } }

.hamburger-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    padding: 0.4rem;
    color: #94a3b8;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
}
.hamburger-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #e2e8f0;
}

/* Mobile menu */
.nav-mobile-menu {
    background: #0f172a;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* Page header */
.app-page-header {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
</style>
