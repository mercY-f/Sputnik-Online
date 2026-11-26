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
            <h2 class="font-semibold text-xl text-ink leading-tight">Admin Dashboard</h2>
        </template>

        <div class="py-12">
            <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">

                <!-- Quick Actions -->
                <div class="p-4 sm:p-6 border border-ink bg-paper text-ink shadow-hard flex items-center justify-between">
                    <h3 class="text-lg font-medium text-ink">Admin Actions</h3>
                    <div class="flex gap-3">
                        <Link :href="route('admin.satellites.index')" class="inline-flex items-center border border-ink bg-ink px-4 py-2 font-mono font-semibold text-xs text-paper uppercase tracking-widest hover:bg-paper hover:text-ink focus:outline-none transition ease-in-out duration-150">
                            🛰️ Manage Satellites
                        </Link>
                    </div>
                </div>

                <!-- Roles Section -->
                <div class="p-4 sm:p-8 border border-ink bg-paper text-ink shadow-hard">
                    <h3 class="text-lg font-medium text-ink mb-4">Roles & Users Count</h3>
                    <ul class="list-disc pl-5">
                        <li v-for="role in roles" :key="role.id" class="text-ink-muted">
                            <strong>{{ role.name.toUpperCase() }}</strong>: {{ role.users_count }} users assigned
                        </li>
                    </ul>
                </div>

                <!-- Users Section (Demonstrates 1:1 and 1:N relations) -->
                <div class="p-4 sm:p-8 border border-ink bg-paper text-ink shadow-hard">
                    <h3 class="text-lg font-medium text-ink mb-4">System Users</h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y-2 divide-ink bg-paper text-sm">
                            <thead class="ltr:text-left rtl:text-right">
                                <tr>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">Name</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">Email</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">Role</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">Timezone (Profile 1:1)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-ink">
                                <tr v-for="user in users" :key="user.id">
                                    <td class="whitespace-nowrap px-4 py-2 text-ink">{{ user.name }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-ink">{{ user.email }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-ink">
                                        <span class="border border-ink bg-surface px-2 py-0.5 font-mono text-xs uppercase text-ink-muted">
                                            {{ user.role?.name || 'No Role' }}
                                        </span>
                                    </td>
                                    <td class="whitespace-nowrap px-4 py-2 text-ink">
                                        {{ user.profile?.timezone || 'N/A' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Categories Section (Demonstrates 1:N relations) -->
                <div class="p-4 sm:p-8 border border-ink bg-paper text-ink shadow-hard">
                    <h3 class="text-lg font-medium text-ink mb-4">Satellite Categories</h3>
                    <ul class="list-disc pl-5">
                        <li v-for="category in categories" :key="category.id" class="text-ink-muted">
                            <strong>{{ category.name }}</strong>: {{ category.satellites_count }} satellites loaded
                        </li>
                    </ul>
                </div>

            </div>
        </div>
    </AuthenticatedLayout>
</template>
