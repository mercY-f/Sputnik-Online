<script setup>
import { Head, Link, router } from '@inertiajs/vue3';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout.vue';

defineProps({
    satellites: {
        type: Object,
        required: true,
    }
});

const destroy = (id) => {
    if (confirm('Are you sure you want to delete this satellite?')) {
        router.delete(route('admin.satellites.destroy', id), {
            preserveScroll: true,
        });
    }
};
</script>

<template>
    <Head title="Manage Satellites" />

    <AuthenticatedLayout>
        <template #header>
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">Manage Satellites</h2>
        </template>

        <div class="py-12">
            <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
                
                <!-- Feedback message -->
                <div v-if="$page.props.flash?.message" class="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
                    <span class="block sm:inline">{{ $page.props.flash.message }}</span>
                </div>

                <div class="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                    <div class="p-6 text-gray-900 overflow-x-auto">
                        
                        <table class="min-w-full divide-y-2 divide-gray-200 bg-white text-sm">
                            <thead class="ltr:text-left rtl:text-right">
                                <tr>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">NORAD ID</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">Name</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-left">Category</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-gray-900 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                <tr v-for="satellite in satellites.data" :key="satellite.id">
                                    <td class="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{{ satellite.catalog_number }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-gray-700">{{ satellite.name }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-gray-700">
                                        <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                            {{ satellite.category || 'Unknown' }}
                                        </span>
                                    </td>
                                    <td class="whitespace-nowrap px-4 py-2 text-right">
                                        <Link 
                                            v-if="$page.props.auth.user.privileges?.includes('edit')"
                                            :href="route('admin.satellites.edit', satellite.id)" 
                                            class="inline-block bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 rounded mr-2">
                                            Edit
                                        </Link>
                                        <button 
                                            v-if="$page.props.auth.user.privileges?.includes('delete')"
                                            @click="destroy(satellite.id)" 
                                            class="inline-block bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 rounded">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Pagination Links -->
                        <div class="mt-4 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
                            <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                                <div>
                                    <p class="text-sm text-gray-700">
                                        Showing <span class="font-medium">{{ satellites.from || 0 }}</span> to <span class="font-medium">{{ satellites.to || 0 }}</span> of <span class="font-medium">{{ satellites.total }}</span> results
                                    </p>
                                </div>
                                <div>
                                    <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                        <component
                                            :is="link.url ? Link : 'span'"
                                            v-for="(link, p) in satellites.links"
                                            :key="p"
                                            :href="link.url"
                                            v-html="link.label"
                                            class="relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0"
                                            :class="[
                                                link.active ? 'z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600' : 'text-gray-900 hover:bg-gray-50',
                                                !link.url ? 'text-gray-400 cursor-not-allowed' : ''
                                            ]"
                                        />
                                    </nav>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </AuthenticatedLayout>
</template>
