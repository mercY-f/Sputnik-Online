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
            <h2 class="text-lg font-medium text-ink">
                Подключение Telegram
            </h2>

            <p class="mt-1 text-sm text-ink-muted">
                Привяжите свой аккаунт Telegram для получения уведомлений о пролетах спутников.
            </p>
        </header>

        <div class="mt-6">
            <!-- Already connected -->
            <div v-if="user.telegram_id" class="flex items-center gap-4">
                <p class="text-sm text-ink font-medium">
                    ✅ Ваш Telegram аккаунт успешно подключен!
                </p>
                <DangerButton :class="{ 'opacity-25': disconnectForm.processing }" :disabled="disconnectForm.processing" @click="disconnectTelegram">
                    Отключить Telegram
                </DangerButton>
            </div>

            <!-- Wait for connection -->
            <div v-else-if="user.telegram_link_token" class="space-y-4">
                <p class="text-sm text-ink-muted font-medium pb-2 border-b border-ink">
                    Ожидание подключения...
                </p>
                
                <div class="bg-surface p-4 border border-ink">
                    <p class="text-sm text-ink mb-2">
                        1. Откройте нашего Telegram бота <strong><a href="https://t.me/earth_orbit_live_bot" target="_blank" class="text-ink underline hover:text-ink-muted">@earth_orbit_live_bot</a></strong>
                    </p>
                    <p class="text-sm text-ink">
                        2. Отправьте боту следующую команду для привязки:
                    </p>
                    <div class="mt-3 flex items-center justify-between bg-surface border border-ink px-3 py-2">
                        <code class="text-sm font-mono font-semibold text-ink select-all">/link {{ user.telegram_link_token }}</code>
                    </div>
                </div>

                <p class="text-xs text-ink-muted mt-2">
                    Этот токен будет недействителен после использования. Для генерации нового токена, нажмите кнопку ниже.
                </p>

                <PrimaryButton :class="{ 'opacity-25': generateForm.processing }" :disabled="generateForm.processing" @click="generateToken">
                    Сгенерировать новый токен
                </PrimaryButton>
            </div>

            <!-- Not connected, no token -->
            <div v-else>
                <p class="text-sm text-ink-muted mb-4">
                    Telegram не подключен. Сгенерируйте уникальный токен для безопасной привязки аккаунта.
                </p>
                
                <PrimaryButton :class="{ 'opacity-25': generateForm.processing }" :disabled="generateForm.processing" @click="generateToken">
                    Получить токен привязки
                </PrimaryButton>
            </div>
        </div>
    </section>
</template>
