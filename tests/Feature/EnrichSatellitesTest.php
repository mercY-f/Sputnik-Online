<?php

namespace Tests\Feature;

use App\Models\Satellite;
use App\Support\SatelliteCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class EnrichSatellitesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SatelliteCache::forgetCatalog();
    }

    public function test_enrich_command_populates_metadata_from_fixture(): void
    {
        $sat = Satellite::create([
            'name' => 'STARLINK-1454',
            'catalog_number' => '45671',
            'category' => 'STARLINK',
            'tle1' => '1 45671U 20035A   26299.00000000  .00000000  00000-0  00000-0 0  9999',
            'tle2' => '2 45671  53.0217 352.5903 0005834 344.5861  15.5004 16.35664987354980',
        ]);

        $fixtureCsv = <<<CSV
OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE
STARLINK-1454,2020-035A,45671,PAY,+,US,2020-06-04,AFETR,,90.5,53.02,550,545,1.25,,EA,ORB
CSV;

        $fixturePath = storage_path('framework/testing/test_satcat.csv');
        File::ensureDirectoryExists(dirname($fixturePath));
        File::put($fixturePath, $fixtureCsv);

        $this->artisan('satellites:enrich', ['--file' => $fixturePath])->assertSuccessful();

        $sat->refresh();
        $this->assertSame('US', $sat->country);
        $this->assertSame('США', $sat->country_name);
        $this->assertSame('2020-06-04', $sat->launch_date?->format('Y-m-d'));
        $this->assertSame('AFETR', $sat->launch_site);
        $this->assertSame('Широкополосный интернет', $sat->purpose);
        $this->assertSame('PAY', $sat->object_type);
        $this->assertSame('1.25', $sat->rcs_size);
        $this->assertNull($sat->decay_date);

        // Test idempotency
        $this->artisan('satellites:enrich', ['--file' => $fixturePath])->assertSuccessful();

        @unlink($fixturePath);
    }
}
