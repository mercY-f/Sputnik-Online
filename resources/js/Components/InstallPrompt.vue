<template>
  <div v-if="showInstallPrompt" class="fixed bottom-4 right-4 bg-gray-900 border border-gray-700 p-4 rounded-xl shadow-2xl z-50 flex flex-col sm:flex-row items-center gap-4 text-white max-w-sm animate-fade-in-up">
    <div class="p-2 bg-blue-900/50 rounded-lg">
      <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
      </svg>
    </div>
    <div class="flex-1">
      <h4 class="font-bold text-sm">Установить приложение</h4>
      <p class="text-xs text-gray-400 mt-1">Добавьте Earth Orbit Live на главный экран для быстрого доступа и работы оффлайн.</p>
    </div>
    <div class="flex sm:flex-col gap-2 w-full sm:w-auto">
      <button @click="installApp" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors">
        Установить
      </button>
      <button @click="dismissPrompt" class="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 px-4 rounded-lg transition-colors">
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
