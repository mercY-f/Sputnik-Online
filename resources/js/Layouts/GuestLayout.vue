<script setup>
import ApplicationLogo from '@/Components/ApplicationLogo.vue';
import { Link } from '@inertiajs/vue3';
</script>

<template>
    <div class="guest-layout">
        <div class="guest-inner">
            <!-- Logo & Title -->
            <div class="guest-logo-wrap">
                <Link href="/" class="guest-logo-link" aria-label="OrbitTrack — на главную">
                    <ApplicationLogo class="guest-logo" />
                </Link>
                <h1 class="guest-title">Orbit<span>Track</span></h1>
                <p class="guest-subtitle">Satellite Tracking System</p>
            </div>

            <!-- Form Card -->
            <div class="guest-card">
                <slot />
            </div>
        </div>
    </div>
</template>

<style scoped>
.guest-layout {
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.guest-inner {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 420px;
    padding: 1.5rem;
}

/* Logo */
.guest-logo-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 2rem;
}

.guest-logo-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: var(--surface);
    border: 1px solid var(--ink);
    margin-bottom: 1rem;
    transition: background 0.2s;
}
.guest-logo-link:hover {
    background: var(--paper);
}

.guest-logo {
    width: 38px;
    height: 38px;
    color: var(--ink);
    stroke: var(--ink);
}

.guest-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.5px;
    margin: 0;
}
.guest-title span {
    color: var(--ink);
}
.guest-subtitle {
    font-size: 0.8rem;
    color: var(--ink-muted);
    margin: 4px 0 0 0;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* Card */
.guest-card {
    width: 100%;
    background: var(--paper);
    border: 2px solid var(--ink);
    padding: 2rem 2rem 1.75rem;
    box-shadow: var(--shadow-hard);
}
</style>
