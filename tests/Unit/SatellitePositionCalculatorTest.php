<?php

namespace Tests\Unit;

use App\Services\SatellitePositionCalculator;
use DateTime;
use DateTimeZone;
use Tests\TestCase;

class SatellitePositionCalculatorTest extends TestCase
{
    private const ISS_TLE1 = '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995';
    private const ISS_TLE2 = '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065';

    public function test_get_position_matches_batch_position(): void
    {
        $calc = new SatellitePositionCalculator();
        $time = new DateTime('2026-10-26 12:00:00', new DateTimeZone('UTC'));

        $single = $calc->getPosition(self::ISS_TLE1, self::ISS_TLE2, $time);
        $batch = $calc->getPositionsBatch([['tle1' => self::ISS_TLE1, 'tle2' => self::ISS_TLE2]], $time);

        $this->assertNotNull($single, 'Single position calculation must not be null');
        $this->assertCount(1, $batch);
        $this->assertNotNull($batch[0], 'Batch position calculation must not be null');

        $this->assertEqualsWithDelta($single['lat'], $batch[0]['lat'], 1e-6, 'Latitude must match');
        $this->assertEqualsWithDelta($single['lng'], $batch[0]['lng'], 1e-6, 'Longitude must match');
        $this->assertEqualsWithDelta($single['alt_km'], $batch[0]['alt_km'], 1e-6, 'Altitude must match');
    }

    public function test_iss_position_is_within_valid_physical_bounds(): void
    {
        $calc = new SatellitePositionCalculator();
        $time = new DateTime('2026-10-26 12:00:00', new DateTimeZone('UTC'));

        $pos = $calc->getPosition(self::ISS_TLE1, self::ISS_TLE2, $time);

        $this->assertNotNull($pos);
        $this->assertGreaterThanOrEqual(-90.0, $pos['lat'], 'Latitude should be >= -90');
        $this->assertLessThanOrEqual(90.0, $pos['lat'], 'Latitude should be <= 90');
        $this->assertGreaterThanOrEqual(300.0, $pos['alt_km'], 'ISS altitude should be >= 300 km');
        $this->assertLessThanOrEqual(500.0, $pos['alt_km'], 'ISS altitude should be <= 500 km');
    }

    public function test_broken_or_empty_tle_returns_null_without_crashing(): void
    {
        $calc = new SatellitePositionCalculator();

        $result = $calc->getPosition('', '');
        $this->assertNull($result);
        $this->assertNull($calc->getPosition('invalid tle line 1', 'invalid tle line 2'));
        $this->assertNull($calc->getPosition(self::ISS_TLE1, 'bad tle line 2'));
    }
}
