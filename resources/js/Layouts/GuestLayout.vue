<script setup>
import ApplicationLogo from '@/Components/ApplicationLogo.vue';
import { Link } from '@inertiajs/vue3';
</script>

<template>
    <div class="guest-layout">
        <!-- Stars background -->
        <div class="stars-bg" aria-hidden="true">
            <div class="star" v-for="i in 60" :key="i" :style="{
                left: (Math.random() * 100) + '%',
                top: (Math.random() * 100) + '%',
                width: (Math.random() * 2 + 1) + 'px',
                height: (Math.random() * 2 + 1) + 'px',
                animationDelay: (Math.random() * 3) + 's',
                animationDuration: (Math.random() * 3 + 2) + 's',
            }" />
        </div>

        <!-- Glowing orb -->
        <div class="glow-orb" aria-hidden="true" />

        <div class="guest-inner">
            <!-- Logo & Title -->
            <div class="guest-logo-wrap">
                <Link href="/" class="guest-logo-link">
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
    background: linear-gradient(135deg, #0a0e1a 0%, #0d1b2e 40%, #0f1f35 70%, #080c18 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    font-family: 'Inter', system-ui, sans-serif;
}

/* Stars */
.stars-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
}
.star {
    position: absolute;
    background: #fff;
    border-radius: 50%;
    opacity: 0.6;
    animation: twinkle linear infinite;
}
@keyframes twinkle {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.9; }
}

/* Glowing orb */
.glow-orb {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
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
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.35);
    border-radius: 16px;
    margin-bottom: 1rem;
    transition: background 0.3s, box-shadow 0.3s;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.2);
}
.guest-logo-link:hover {
    background: rgba(59, 130, 246, 0.25);
    box-shadow: 0 0 30px rgba(59, 130, 246, 0.4);
}

.guest-logo {
    width: 38px;
    height: 38px;
    color: #60a5fa;
    stroke: #60a5fa;
}

.guest-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: #f0f6ff;
    letter-spacing: -0.5px;
    margin: 0;
}
.guest-title span {
    color: #60a5fa;
}
.guest-subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin: 4px 0 0 0;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* Card */
.guest-card {
    width: 100%;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 2rem 2rem 1.75rem;
    box-shadow:
        0 4px 6px rgba(0, 0, 0, 0.3),
        0 20px 40px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
</style>
