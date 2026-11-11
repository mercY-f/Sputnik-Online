<?php

namespace Tests\Feature;

use App\Models\Satellite;
use App\Support\SatelliteCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class SatelliteApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SatelliteCache::forgetCatalog();
        Cache::flush();
    }

    public function test_api_returns_all_satellites_without_limit_ordered_by_id(): void
    {
        $sat1 = Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995',
            'tle2' => '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065',
        ]);
        $sat2 = Satellite::create([
            'name' => 'STARLINK-1001',
            'catalog_number' => '44713',
            'category' => 'STARLINK',
            'tle1' => '1 44713U 19074A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 44713  53.0540 100.0000 0001000   0.0000   0.0000 15.00000000    11',
        ]);
        $sat3 = Satellite::create([
            'name' => 'NOAA 19',
            'catalog_number' => '33591',
            'category' => 'WEATHER',
            'tle1' => '1 33591U 09005A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 33591  99.0000 100.0000 0001000   0.0000   0.0000 14.00000000    11',
        ]);

        $response = $this->getJson('/api/satellites');

        $response->assertOk();
        $response->assertJsonCount(3);

        $data = $response->json();
        $returnedIds = array_column($data, 'id');
        $this->assertSame([$sat1->id, $sat2->id, $sat3->id], $returnedIds);
    }

    public function test_api_category_filter_returns_only_matching_category(): void
    {
        Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995',
            'tle2' => '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065',
        ]);
        $starlink = Satellite::create([
            'name' => 'STARLINK-1001',
            'catalog_number' => '44713',
            'category' => 'STARLINK',
            'tle1' => '1 44713U 19074A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 44713  53.0540 100.0000 0001000   0.0000   0.0000 15.00000000    11',
        ]);

        $response = $this->getJson('/api/satellites?category=STARLINK');

        $response->assertOk();
        $response->assertJsonCount(1);
        $this->assertSame($starlink->id, $response->json('0.id'));
        $this->assertSame('STARLINK', $response->json('0.category'));
    }

    public function test_api_known_category_case_insensitivity(): void
    {
        Satellite::create([
            'name' => 'NOAA 19',
            'catalog_number' => '33591',
            'category' => 'WEATHER',
            'tle1' => '1 33591U 09005A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 33591  99.0000 100.0000 0001000   0.0000   0.0000 14.00000000    11',
        ]);

        $response = $this->getJson('/api/satellites?category=weather');

        $response->assertOk();
        $response->assertJsonCount(1);
        $this->assertSame('WEATHER', $response->json('0.category'));
        $this->assertTrue(Cache::has(SatelliteCache::apiKey('WEATHER')));
    }

    public function test_api_unknown_category_normalizes_to_all(): void
    {
        Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995',
            'tle2' => '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065',
        ]);
        Satellite::create([
            'name' => 'STARLINK-1001',
            'catalog_number' => '44713',
            'category' => 'STARLINK',
            'tle1' => '1 44713U 19074A   23320.50000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 44713  53.0540 100.0000 0001000   0.0000   0.0000 15.00000000    11',
        ]);

        $response = $this->getJson('/api/satellites?category=UNKNOWN_NONEXISTENT_XYZ');

        $response->assertOk();
        $response->assertJsonCount(2);
        $this->assertTrue(Cache::has(SatelliteCache::apiKey('ALL')));
        $this->assertFalse(Cache::has('satellites:api:UNKNOWN_NONEXISTENT_XYZ:v2'));
    }
}
