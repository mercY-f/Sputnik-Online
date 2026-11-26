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
            <h2 class="font-semibold text-xl text-ink leading-tight">Manage Satellites</h2>
        </template>

        <div class="py-12">
            <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
                
                <!-- Feedback message -->
                <div v-if="$page.props.flash?.message" class="mb-4 border border-ink bg-surface text-ink px-4 py-3" role="alert">
                    <span class="block sm:inline">{{ $page.props.flash.message }}</span>
                </div>

                <div class="border border-ink bg-paper text-ink overflow-hidden shadow-hard">
                    <div class="p-6 text-ink overflow-x-auto">
                        
                        <table class="min-w-full divide-y-2 divide-ink bg-paper text-sm">
                            <thead class="ltr:text-left rtl:text-right">
                                <tr>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">NORAD ID</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">Name</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-left">Category</th>
                                    <th class="whitespace-nowrap px-4 py-2 font-medium text-ink text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-ink">
                                <tr v-for="satellite in satellites.data" :key="satellite.id">
                                    <td class="whitespace-nowrap px-4 py-2 font-medium text-ink">{{ satellite.catalog_number }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-ink">{{ satellite.name }}</td>
                                    <td class="whitespace-nowrap px-4 py-2 text-ink">
                                        <span class="border border-ink bg-surface px-2 py-0.5 font-mono text-xs uppercase text-ink-muted">
                                            {{ satellite.category || 'Unknown' }}
                                        </span>
                                    </td>
                                    <td class="whitespace-nowrap px-4 py-2 text-right">
                                        <Link 
                                            v-if="$page.props.auth.user.privileges?.includes('edit')"
                                            :href="route('admin.satellites.edit', satellite.id)" 
                                            class="inline-block border border-ink bg-ink px-4 py-2 text-xs font-medium text-paper hover:bg-paper hover:text-ink mr-2">
                                            Edit
                                        </Link>
                                        <button 
                                            v-if="$page.props.auth.user.privileges?.includes('delete')"
                                            @click="destroy(satellite.id)" 
                                            class="inline-block border border-ink bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-ink hover:text-paper">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Pagination Links -->
                        <div class="mt-4 flex items-center justify-between border-t border-ink bg-paper px-4 py-3 sm:px-6">
                            <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                                <div>
                                    <p class="text-sm text-ink">
                                        Showing <span class="font-medium">{{ satellites.from || 0 }}</span> to <span class="font-medium">{{ satellites.to || 0 }}</span> of <span class="font-medium">{{ satellites.total }}</span> results
                                    </p>
                                </div>
                                <div>
                                    <nav class="isolate inline-flex -space-x-px shadow-hard" aria-label="Pagination">
                                        <component
                                            :is="link.url ? Link : 'span'"
                                            v-for="(link, p) in satellites.links"
                                            :key="p"
                                            :href="link.url"
                                            v-html="link.label"
                                            class="relative inline-flex items-center border border-ink px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0"
                                            :class="[
                                                link.active ? 'z-10 bg-ink text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink' : 'text-ink hover:bg-surface',
                                                !link.url ? 'text-ink-muted cursor-not-allowed' : ''
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
