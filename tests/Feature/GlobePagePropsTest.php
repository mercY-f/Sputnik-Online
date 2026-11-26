<?php

namespace Tests\Feature;

use App\Models\Satellite;
use App\Support\SatelliteCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class GlobePagePropsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SatelliteCache::forgetCatalog();
        Cache::flush();
    }

    public function test_globe_page_renders_with_contract_props(): void
    {
        Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995',
            'tle2' => '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065',
        ]);

        $response = $this->get('/');

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Globe/Index')
            ->has('satelliteCount')
            ->where('satelliteCount', 1)
            ->has('categories')
            ->has('categories.ALL')
            ->has('categories.ISS')
            ->where('categories.ALL', 1)
            ->where('categories.ISS', 1)
            ->has('tleStatus')
            ->has('tleStatus.epoch')
            ->where('tleStatus.epoch', null)
            ->has('tleStatus.updatedAt')
            ->whereNot('tleStatus.updatedAt', null)
        );
    }
}
