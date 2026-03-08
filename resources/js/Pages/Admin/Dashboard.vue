<script setup>
import { Head, Link } from '@inertiajs/vue3';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout.vue';

defineProps({
    users: {
        type: Array,
        required: true,
    },
    categories: {
        type: Array,
        required: true,
    },
    roles: {
        type: Array,
        required: true,
    },
});
</script>

<template>
    <Head title="Admin Dashboard" />

    <AuthenticatedLayout>
        <template #header>
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">Admin Dashboard</h2>
        </template>

        <div class="py-12">
            <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">
                <!-- Roles Section -->
                <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Roles & Users Count</h3>
                    <ul class="list-disc pl-5">
                        <li v-for="role in roles" :key="role.id" class="text-gray-600">
                            <strong>{{ role.name.toUpperCase() }}</strong>: {{ role.users_count }} users assigned
                        </li>
                    </ul>
                </div>

                <!-- Users Section (Demonstrates 1:1 and 1:N relations) -->
                <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">System Users</h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y-2 divide-gray-200 bg-white text-sm">
                            <thead class="ltr:text-left rtl:text-right">
                                <tr>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">Name</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">Email</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">Role</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">Timezone (Profile 1:1)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                <tr v-for="user in users" :key="user.id">
                                    <td class="whitespace-nowrap px-4 py-2 text-gray-700">{{ user.name }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-gray-700">{{ user.email }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-gray-700">
                                        <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                            {{ user.role?.name || 'No Role' }}
                                        </span>
                                    </td>
                                    <td class="whitespace-nowrap px-4 py-2 text-gray-700">
                                        {{ user.profile?.timezone || 'N/A' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Categories Section (Demonstrates 1:N relations) -->
                <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Satellite Categories</h3>
                    <ul class="list-disc pl-5">
                        <li v-for="category in categories" :key="category.id" class="text-gray-600">
                            <strong>{{ category.name }}</strong>: {{ category.satellites_count }} satellites loaded
                        </li>
                    </ul>
                </div>

            </div>
        </div>
    </AuthenticatedLayout>
</template>
