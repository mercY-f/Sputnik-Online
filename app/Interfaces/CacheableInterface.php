<?php

namespace App\Interfaces;

interface CacheableInterface
{
    /**
     * Get the specific cache key for this entity.
     *
     * @return string
     */
    public function getCacheKey(): string;

    /**
     * Get the time-to-live for the cache in seconds.
     *
     * @return int
     */
    public function getCacheTtl(): int;

    /**
     * Clear the cache for this entity.
     *
     * @return void
     */
    public function clearCache(): void;
}
