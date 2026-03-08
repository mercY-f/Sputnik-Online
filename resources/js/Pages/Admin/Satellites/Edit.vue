<script setup>
import { Head, Link, useForm } from '@inertiajs/vue3';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout.vue';
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';
import TextInput from '@/Components/TextInput.vue';

const props = defineProps({
    satellite: {
        type: Object,
        required: true,
    },
    categories: {
        type: Array,
        required: true,
    }
});

const form = useForm({
    name: props.satellite.name,
    catalog_number: props.satellite.catalog_number,
    category: props.satellite.category || '',
    tle1: props.satellite.tle1,
    tle2: props.satellite.tle2,
});

const submit = () => {
    form.put(route('admin.satellites.update', props.satellite.id));
};
</script>

<template>
    <Head title="Edit Satellite" />

    <AuthenticatedLayout>
        <template #header>
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">Edit Satellite: {{ satellite.name }}</h2>
        </template>

        <div class="py-12">
            <div class="max-w-4xl mx-auto sm:px-6 lg:px-8">
                <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                    <section class="max-w-xl">
                        <header>
                            <h2 class="text-lg font-medium text-gray-900">Satellite Information</h2>
                            <p class="mt-1 text-sm text-gray-600">
                                Update the satellite's core details and orbital parameters (TLE).
                            </p>
                        </header>

                        <form @submit.prevent="submit" class="mt-6 space-y-6">
                            
                            <!-- Name -->
                            <div>
                                <InputLabel for="name" value="Name" />
                                <TextInput
                                    id="name"
                                    type="text"
                                    class="mt-1 block w-full"
                                    v-model="form.name"
                                    required
                                    autofocus
                                />
                                <InputError class="mt-2" :message="form.errors.name" />
                            </div>
                            
                            <!-- Catalog Number (NORAD) -->
                            <div>
                                <InputLabel for="catalog_number" value="Catalog Number (NORAD ID)" />
                                <TextInput
                                    id="catalog_number"
                                    type="number"
                                    class="mt-1 block w-full"
                                    v-model="form.catalog_number"
                                    required
                                />
                                <InputError class="mt-2" :message="form.errors.catalog_number" />
                            </div>

                            <!-- Category -->
                            <div>
                                <InputLabel for="category" value="Category" />
                                <select
                                    id="category"
                                    v-model="form.category"
                                    class="mt-1 block w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm"
                                    required
                                >
                                    <option value="" disabled>Select a category</option>
                                    <option v-for="category in categories" :key="category.name" :value="category.name">
                                        {{ category.name }}
                                    </option>
                                </select>
                                <InputError class="mt-2" :message="form.errors.category" />
                            </div>
                            
                            <!-- TLE Line 1 -->
                            <div>
                                <InputLabel for="tle1" value="TLE Line 1" />
                                <TextInput
                                    id="tle1"
                                    type="text"
                                    class="mt-1 block w-full font-mono text-sm"
                                    v-model="form.tle1"
                                    required
                                />
                                <InputError class="mt-2" :message="form.errors.tle1" />
                            </div>

                            <!-- TLE Line 2 -->
                            <div>
                                <InputLabel for="tle2" value="TLE Line 2" />
                                <TextInput
                                    id="tle2"
                                    type="text"
                                    class="mt-1 block w-full font-mono text-sm"
                                    v-model="form.tle2"
                                    required
                                />
                                <InputError class="mt-2" :message="form.errors.tle2" />
                            </div>

                            <div class="flex items-center gap-4">
                                <PrimaryButton :disabled="form.processing">Save Changes</PrimaryButton>
                                
                                <Link 
                                    :href="route('admin.satellites.index')" 
                                    class="inline-flex items-center px-4 py-2 bg-gray-200 border border-transparent rounded-md font-semibold text-xs text-gray-800 uppercase tracking-widest hover:bg-gray-300 focus:bg-gray-300 active:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition ease-in-out duration-150"
                                >
                                    Cancel
                                </Link>

                                <Transition
                                    enter-active-class="transition ease-in-out"
                                    enter-from-class="opacity-0"
                                    leave-active-class="transition ease-in-out"
                                    leave-to-class="opacity-0"
                                >
                                    <p v-if="form.recentlySuccessful" class="text-sm text-gray-600">Saved.</p>
                                </Transition>
                            </div>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    </AuthenticatedLayout>
</template>
