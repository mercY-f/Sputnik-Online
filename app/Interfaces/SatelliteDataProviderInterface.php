<?php

namespace App\Interfaces;

interface SatelliteDataProviderInterface
{
    /**
     * Fetch TLE data for a single satellite by catalog number.
     *
     * @param int|string $catalogNumber
     * @return array|null The TLE data array or null if not found
     */
    public function fetchTleByCatalogNumber($catalogNumber): ?array;

    /**
     * Fetch TLE data for a group of satellites based on category.
     *
     * @param string $categoryName
     * @return array Array of TLE data
     */
    public function fetchTleByCategoryGroup(string $categoryName): array;
}
