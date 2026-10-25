<template>
    <!-- Satellite icon - custom SVG -->
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none">
        <!-- Satellite body -->
        <rect x="24" y="24" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2.5" fill="none"/>
        <!-- Solar panels left -->
        <rect x="4" y="27" width="16" height="10" rx="1.5" stroke="currentColor" stroke-width="2" fill="none"/>
        <line x1="8" y1="27" x2="8" y2="37" stroke="currentColor" stroke-width="1.5"/>
        <line x1="12" y1="27" x2="12" y2="37" stroke="currentColor" stroke-width="1.5"/>
        <line x1="16" y1="27" x2="16" y2="37" stroke="currentColor" stroke-width="1.5"/>
        <line x1="20" y1="32" x2="24" y2="32" stroke="currentColor" stroke-width="2"/>
        <!-- Solar panels right -->
        <rect x="44" y="27" width="16" height="10" rx="1.5" stroke="currentColor" stroke-width="2" fill="none"/>
        <line x1="48" y1="27" x2="48" y2="37" stroke="currentColor" stroke-width="1.5"/>
        <line x1="52" y1="27" x2="52" y2="37" stroke="currentColor" stroke-width="1.5"/>
        <line x1="56" y1="27" x2="56" y2="37" stroke="currentColor" stroke-width="1.5"/>
        <line x1="40" y1="32" x2="44" y2="32" stroke="currentColor" stroke-width="2"/>
        <!-- Antenna -->
        <line x1="32" y1="24" x2="32" y2="14" stroke="currentColor" stroke-width="2"/>
        <circle cx="32" cy="11" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
        <!-- Signal arcs -->
        <path d="M26 8 Q32 3 38 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M22 5 Q32 -2 42 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.5"/>
    </svg>
</template>
