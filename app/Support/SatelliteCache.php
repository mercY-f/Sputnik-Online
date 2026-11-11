<?php

namespace App\Support;

use App\Models\Satellite;
use Illuminate\Support\Facades\Cache;

class SatelliteCache
{
    public const PREFIX_API = 'satellites:api';
    public const API_VERSION = 'v2';
    public const KEY_CATEGORIES = 'satellites:categories';
    public const PREFIX_SATELLITE = 'satellite_';

    public const DEFAULT_CATEGORIES = [
        'ALL',
        'ISS',
        'STARLINK',
        'ONEWEB',
        'IRIDIUM',
        'NAVIGATION',
        'WEATHER',
        'TELESCOPE',
        'OTHER',
    ];

    /**
     * Cache key for catalog API by category.
     */
    public static function apiKey(string $category): string
    {
        return self::PREFIX_API . ":{$category}:" . self::API_VERSION;
    }

    /**
     * Cache key for catalog categories.
     */
    public static function categoriesKey(): string
    {
        return self::KEY_CATEGORIES;
    }

    /**
     * Cache key for a single satellite.
     */
    public static function satelliteKey(int|string|null $id): string
    {
        return self::PREFIX_SATELLITE . $id;
    }

    /**
     * Normalize category from request input to avoid arbitrary cache key pollution.
     */
    public static function normalizeCategory(mixed $category): string
    {
        if (!is_string($category) || trim($category) === '') {
            return 'ALL';
        }

        $upper = strtoupper(trim($category));

        if (in_array($upper, self::DEFAULT_CATEGORIES, true)) {
            return $upper;
        }

        try {
            if (Satellite::query()->where('category', $upper)->exists()) {
                return $upper;
            }
        } catch (\Throwable) {
            // Fallback if table does not exist or database is unavailable
        }

        return 'ALL';
    }

    /**
     * Forget all catalog-related cache keys without flushing the entire cache store.
     */
    public static function forgetCatalog(): void
    {
        try {
            $dbCategories = Satellite::query()
                ->distinct()
                ->pluck('category')
                ->filter()
                ->all();
        } catch (\Throwable) {
            $dbCategories = [];
        }

        $categories = array_unique(array_merge(self::DEFAULT_CATEGORIES, $dbCategories, ['ALL']));

        foreach ($categories as $category) {
            Cache::forget(self::apiKey($category));
        }

        Cache::forget(self::categoriesKey());
    }

    /**
     * Forget cache for a single satellite.
     */
    public static function forgetSatellite(int|string|null $id): void
    {
        Cache::forget(self::satelliteKey($id));
    }
}
