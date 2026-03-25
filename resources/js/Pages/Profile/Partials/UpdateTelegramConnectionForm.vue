<script setup>
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';
import DangerButton from '@/Components/DangerButton.vue';
import { useForm, usePage } from '@inertiajs/vue3';

const user = usePage().props.auth.user;

const generateForm = useForm({});
const disconnectForm = useForm({});

const generateToken = () => {
    generateForm.post(route('profile.telegram.token'), {
        preserveScroll: true,
        onSuccess: () => {
            // handle success
        },
    });
};

const disconnectTelegram = () => {
    disconnectForm.delete(route('profile.telegram.disconnect'), {
        preserveScroll: true,
    });
};
</script>

<template>
    <section>
        <header>
            <h2 class="text-lg font-medium text-gray-900">
                Подключение Telegram
            </h2>

            <p class="mt-1 text-sm text-gray-600">
                Привяжите свой аккаунт Telegram для получения уведомлений о пролетах спутников.
            </p>
        </header>

        <div class="mt-6">
            <!-- Already connected -->
            <div v-if="user.telegram_id" class="flex items-center gap-4">
                <p class="text-sm text-green-600 font-medium">
                    ✅ Ваш Telegram аккаунт успешно подключен!
                </p>
                <DangerButton :class="{ 'opacity-25': disconnectForm.processing }" :disabled="disconnectForm.processing" @click="disconnectTelegram">
                    Отключить Telegram
                </DangerButton>
            </div>

            <!-- Wait for connection -->
            <div v-else-if="user.telegram_link_token" class="space-y-4">
                <p class="text-sm text-yellow-600 font-medium pb-2 border-b border-gray-100">
                    Ожидание подключения...
                </p>
                
                <div class="bg-gray-50 p-4 rounded-md border border-gray-200">
                    <p class="text-sm text-gray-800 mb-2">
                        1. Откройте нашего Telegram бота <strong><a href="https://t.me/earth_orbit_live_bot" target="_blank" class="text-indigo-600 hover:underline">@earth_orbit_live_bot</a></strong>
                    </p>
                    <p class="text-sm text-gray-800">
                        2. Отправьте боту следующую команду для привязки:
                    </p>
                    <div class="mt-3 flex items-center justify-between bg-white px-3 py-2 border rounded shadow-sm">
                        <code class="text-sm font-semibold text-indigo-700 select-all">/link {{ user.telegram_link_token }}</code>
                    </div>
                </div>

                <p class="text-xs text-gray-500 mt-2">
                    Этот токен будет недействителен после использования. Для генерации нового токена, нажмите кнопку ниже.
                </p>

                <PrimaryButton :class="{ 'opacity-25': generateForm.processing }" :disabled="generateForm.processing" @click="generateToken">
                    Сгенерировать новый токен
                </PrimaryButton>
            </div>

            <!-- Not connected, no token -->
            <div v-else>
                <p class="text-sm text-gray-600 mb-4">
                    Telegram не подключен. Сгенерируйте уникальный токен для безопасной привязки аккаунта.
                </p>
                
                <PrimaryButton :class="{ 'opacity-25': generateForm.processing }" :disabled="generateForm.processing" @click="generateToken">
                    Получить токен привязки
                </PrimaryButton>
            </div>
        </div>
    </section>
</template>
