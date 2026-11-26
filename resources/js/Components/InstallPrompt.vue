<template>
  <div v-if="showInstallPrompt" class="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col items-center gap-4 border-2 border-ink bg-paper p-4 text-ink shadow-hard sm:flex-row animate-fade-in-up" role="region" aria-label="Установка приложения">
    <div class="border border-ink bg-surface p-2 text-ink">
      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
      </svg>
    </div>
    <div class="flex-1">
      <h4 class="font-mono text-sm font-bold uppercase tracking-wider">Установить приложение</h4>
      <p class="mt-1 text-xs text-ink-muted">Добавьте Earth Orbit Live на главный экран для быстрого доступа и работы оффлайн.</p>
    </div>
    <div class="flex w-full gap-2 sm:w-auto sm:flex-col">
      <button @click="installApp" class="flex-1 border border-ink bg-ink px-4 py-2 text-xs font-bold text-paper transition-colors hover:bg-surface hover:text-ink">
        Установить
      </button>
      <button @click="dismissPrompt" class="flex-1 border border-ink bg-surface px-4 py-2 text-xs text-ink transition-colors hover:bg-paper">
        Позже
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const deferredPrompt = ref(null);
const showInstallPrompt = ref(false);

const handleBeforeInstallPrompt = (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt.value = e;
  // Update UI to notify the user they can add to home screen
  showInstallPrompt.value = true;
};

const installApp = async () => {
  showInstallPrompt.value = false;

  if (deferredPrompt.value) {
    // Show the install prompt
    deferredPrompt.value.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.value.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    deferredPrompt.value = null;
  }
};

const dismissPrompt = () => {
  showInstallPrompt.value = false;
};

onMounted(() => {
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
});
</script>

<style scoped>
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
</style>
