<?php

namespace Tests\Feature;

use App\Models\Satellite;
use App\Support\SatelliteCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class SatelliteCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_forget_catalog_clears_catalog_keys_and_preserves_foreign_keys(): void
    {
        // 1. Записать спутник
        $satellite = Satellite::create([
            'name' => 'STARLINK-1001',
            'catalog_number' => '44713',
            'category' => 'STARLINK',
            'tle1' => '1 44713U 19074A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 44713  53.0540 100.0000 0001000   0.0000   0.0000 15.00000000    11',
        ]);

        // 2. Записать чужой ключ в кэш
        Cache::put('foreign:key', 1, 3600);
        $this->assertTrue(Cache::has('foreign:key'));

        // 3. Прогреть ключ каталога через /api/satellites
        $responseAll = $this->getJson('/api/satellites');
        $responseAll->assertOk();
        $this->assertTrue(Cache::has(SatelliteCache::apiKey('ALL')));

        $responseCat = $this->getJson('/api/satellites?category=STARLINK');
        $responseCat->assertOk();
        $this->assertTrue(Cache::has(SatelliteCache::apiKey('STARLINK')));

        $responseCategories = $this->getJson('/api/satellite-categories');
        $responseCategories->assertOk();
        $this->assertTrue(Cache::has(SatelliteCache::categoriesKey()));

        // 4. Вызвать forgetCatalog()
        SatelliteCache::forgetCatalog();

        // 5. Проверить: foreign:key выжил, ключи каталога сброшены
        $this->assertTrue(Cache::has('foreign:key'));
        $this->assertSame(1, Cache::get('foreign:key'));

        $this->assertFalse(Cache::has(SatelliteCache::apiKey('ALL')));
        $this->assertFalse(Cache::has(SatelliteCache::apiKey('STARLINK')));
        $this->assertFalse(Cache::has(SatelliteCache::categoriesKey()));
    }

    public function test_category_normalization_prevents_arbitrary_cache_keys(): void
    {
        Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => '1 25544U 98067A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 25544  51.6400 100.0000 0001000   0.0000   0.0000 15.00000000    11',
        ]);

        $arbitraryParam = 'random_malicious_string_12345';
        $response = $this->getJson('/api/satellites?category=' . $arbitraryParam);
        $response->assertOk();

        // Произвольный ключ не должен создаваться в кэше
        $this->assertFalse(Cache::has("satellites:api:{$arbitraryParam}:v2"));
        // Вместо этого запрос нормализован к ALL
        $this->assertTrue(Cache::has(SatelliteCache::apiKey('ALL')));
    }

    public function test_satellite_clear_cache_clears_instance_and_catalog_keys(): void
    {
        $satellite = Satellite::create([
            'name' => 'NOAA 19',
            'catalog_number' => '33591',
            'category' => 'WEATHER',
            'tle1' => '1 33591U 09005A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 33591  99.0000 100.0000 0001000   0.0000   0.0000 14.00000000    11',
        ]);

        Cache::put($satellite->getCacheKey(), 'satellite-data', 3600);
        Cache::put(SatelliteCache::apiKey('ALL'), 'catalog-data', 3600);
        Cache::put('foreign:key', 'preserve-me', 3600);

        $satellite->clearCache();

        $this->assertFalse(Cache::has($satellite->getCacheKey()));
        $this->assertFalse(Cache::has(SatelliteCache::apiKey('ALL')));
        $this->assertTrue(Cache::has('foreign:key'));
        $this->assertSame('preserve-me', Cache::get('foreign:key'));
    }
}
