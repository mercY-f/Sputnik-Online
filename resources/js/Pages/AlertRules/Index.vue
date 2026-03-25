<script setup>
import { ref } from 'vue';
import { Head, useForm, router } from '@inertiajs/vue3';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout.vue';
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';
import TextInput from '@/Components/TextInput.vue';
import Checkbox from '@/Components/Checkbox.vue';

const props = defineProps({
    rules: {
        type: Array,
        required: true,
    },
    satellites: {
        type: Array,
        required: true,
    },
});

const form = useForm({
    satellite_id: '',
    latitude: '',
    longitude: '',
    radius_km: 100,
});

const submit = () => {
    form.post(route('alert-rules.store'), {
        preserveScroll: true,
        onSuccess: () => form.reset(),
    });
};

const deleteRule = (id) => {
    if (confirm('Вы уверены, что хотите удалить это правило?')) {
        router.delete(route('alert-rules.destroy', id), {
            preserveScroll: true,
        });
    }
};

const toggleRule = (rule) => {
    router.put(route('alert-rules.update', rule.id), {
        satellite_id: rule.satellite_id,
        latitude: rule.latitude,
        longitude: rule.longitude,
        radius_km: rule.radius_km,
        is_active: !rule.is_active,
    }, {
        preserveScroll: true,
    });
};

// Help function: Get current location
const getCurrentLocation = () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                form.latitude = position.coords.latitude.toFixed(6);
                form.longitude = position.coords.longitude.toFixed(6);
            },
            (error) => {
                alert('Не удалось получить ваше местоположение. Убедитесь, что вы дали разрешение.');
            }
        );
    } else {
        alert('Геолокация не поддерживается вашим браузером.');
    }
};
</script>

<template>
    <Head title="Географические Уведомления" />

    <AuthenticatedLayout>
        <template #header>
            <h2 class="text-xl font-semibold leading-tight text-gray-800">
                Мои уведомления о спутниках
            </h2>
        </template>

        <div class="py-12">
            <div class="mx-auto max-w-7xl space-y-6 sm:px-6 lg:px-8">
                
                <!-- Information Card -->
                <div class="bg-indigo-50 p-6 sm:rounded-lg sm:p-8 flex items-start gap-4">
                    <div class="text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-lg font-medium text-indigo-900">Система гео-оповещений Telegram</h3>
                        <p class="mt-1 text-sm text-indigo-700">
                            Здесь вы можете настроить правила, чтобы наш робот присылал вам уведомления в Telegram, когда выбранный спутник будет пролетать над указанными вами координатами (в заданном радиусе).
                            Широту и долготу можно указать вручную, либо нажать кнопку для авто-определения. Убедитесь, что вы привязали свой Telegram аккаунт в настройках профиля.
                        </p>
                    </div>
                </div>

                <!-- Create Form -->
                <div class="bg-white p-4 shadow sm:rounded-lg sm:p-8">
                    <section>
                        <header>
                            <h2 class="text-lg font-medium text-gray-900">Добавить новое правило</h2>
                            <p class="mt-1 text-sm text-gray-600">Выберите спутник и укажите зону наблюдения.</p>
                        </header>

                        <form @submit.prevent="submit" class="mt-6 space-y-6 max-w-xl">
                            <div>
                                <InputLabel for="satellite_id" value="Спутник" />
                                <select 
                                    id="satellite_id" 
                                    v-model="form.satellite_id"
                                    class="mt-1 block w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm"
                                    required
                                >
                                    <option value="" disabled>Выберите спутник...</option>
                                    <option v-for="satellite in satellites" :key="satellite.id" :value="satellite.id">
                                        {{ satellite.name }} (NORAD: {{ satellite.catalog_number }})
                                    </option>
                                </select>
                                <InputError class="mt-2" :message="form.errors.satellite_id" />
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <InputLabel for="latitude" value="Широта (Lat)" />
                                    <TextInput
                                        id="latitude"
                                        type="number"
                                        step="0.000001"
                                        class="mt-1 block w-full"
                                        v-model="form.latitude"
                                        required
                                    />
                                    <InputError class="mt-2" :message="form.errors.latitude" />
                                </div>
                                <div>
                                    <InputLabel for="longitude" value="Долгота (Lng)" />
                                    <TextInput
                                        id="longitude"
                                        type="number"
                                        step="0.000001"
                                        class="mt-1 block w-full"
                                        v-model="form.longitude"
                                        required
                                    />
                                    <InputError class="mt-2" :message="form.errors.longitude" />
                                </div>
                            </div>
                            
                            <button type="button" @click="getCurrentLocation" class="text-sm text-indigo-600 hover:text-indigo-900 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                </svg>
                                Определить мои координаты
                            </button>

                            <div>
                                <InputLabel for="radius_km" value="Радиус зоны (км)" />
                                <div class="flex items-center gap-4 mt-1">
                                    <input 
                                        type="range" 
                                        id="radius_km" 
                                        min="10" 
                                        max="15000" 
                                        step="100"
                                        v-model="form.radius_km" 
                                        class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    >
                                    <span class="text-gray-700 font-medium whitespace-nowrap w-16 text-right">{{ form.radius_km }} км</span>
                                </div>
                                <InputError class="mt-2" :message="form.errors.radius_km" />
                            </div>

                            <div class="flex items-center gap-4">
                                <PrimaryButton :disabled="form.processing">Сохранить правило</PrimaryButton>

                                <Transition
                                    enter-active-class="transition ease-in-out"
                                    enter-from-class="opacity-0"
                                    leave-active-class="transition ease-in-out"
                                    leave-to-class="opacity-0"
                                >
                                    <p v-if="form.recentlySuccessful" class="text-sm text-green-600">Сохранено.</p>
                                </Transition>
                            </div>
                        </form>
                    </section>
                </div>

                <!-- Existing Rules List -->
                <div class="bg-white p-4 shadow sm:rounded-lg sm:p-8">
                    <section>
                        <header class="flex justify-between items-center mb-6">
                            <div>
                                <h2 class="text-lg font-medium text-gray-900">Ваши активные правила</h2>
                                <p class="mt-1 text-sm text-gray-600">Список спутников, за которыми вы следите.</p>
                            </div>
                        </header>

                        <div v-if="rules.length === 0" class="text-gray-500 text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            У вас пока нет созданных правил для уведомлений.
                        </div>

                        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div v-for="rule in rules" :key="rule.id" 
                                class="border rounded-lg p-4 relative"
                                :class="rule.is_active ? 'border-indigo-200 bg-white' : 'border-gray-200 bg-gray-50'"
                            >
                                <div class="absolute top-4 right-4 flex items-center gap-3">
                                    <button 
                                        @click="toggleRule(rule)" 
                                        :class="rule.is_active ? 'text-indigo-600' : 'text-gray-400'"
                                        class="hover:opacity-75 transition"
                                        :title="rule.is_active ? 'Отключить' : 'Включить'"
                                    >
                                        <svg v-if="rule.is_active" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                                        </svg>
                                    </button>
                                    <button @click="deleteRule(rule.id)" class="text-red-500 hover:text-red-700 transition" title="Удалить">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
                                
                                <h3 class="font-bold text-gray-900 flex items-center gap-2" :class="{ 'opacity-50': !rule.is_active }">
                                    🛰️ {{ rule.satellite.name }}
                                </h3>
                                <div class="mt-2 text-sm text-gray-600 space-y-1" :class="{ 'opacity-50': !rule.is_active }">
                                    <p><strong>NORAD:</strong> {{ rule.satellite.catalog_number }}</p>
                                    <p><strong>Координаты:</strong> {{ rule.latitude }}, {{ rule.longitude }}</p>
                                    <p><strong>Радиус:</strong> {{ rule.radius_km }} км</p>
                                </div>
                                
                                <div class="mt-3 inline-block px-2 py-1 text-xs rounded-full font-medium" 
                                    :class="rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'">
                                    {{ rule.is_active ? 'Активно' : 'На паузе' }}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

            </div>
        </div>
    </AuthenticatedLayout>
</template>
