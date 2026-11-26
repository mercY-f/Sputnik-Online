<?php

namespace Tests\Feature;

use App\Jobs\SendTelegramAlert;
use App\Models\AlertRule;
use App\Models\Satellite;
use App\Models\User;
use App\Services\SatellitePositionCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Tests\TestCase;

class CheckSatelliteAlertsTest extends TestCase
{
    use RefreshDatabase;

    private const ISS_TLE1 = '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995';
    private const ISS_TLE2 = '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065';

    public function test_dispatches_telegram_alert_when_satellite_is_in_range(): void
    {
        Bus::fake();

        $user = User::factory()->create([
            'telegram_id' => '123456789',
        ]);

        $satellite = Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => self::ISS_TLE1,
            'tle2' => self::ISS_TLE2,
        ]);

        $calculator = app(SatellitePositionCalculator::class);
        $pos = $calculator->getPosition($satellite->tle1, $satellite->tle2);
        $this->assertNotNull($pos);

        // Размещаем правило прямо под текущей подспутниковой точкой
        $rule = AlertRule::create([
            'user_id' => $user->id,
            'satellite_id' => $satellite->id,
            'latitude' => $pos['lat'],
            'longitude' => $pos['lng'],
            'radius_km' => 500,
            'is_active' => true,
            'last_notified_at' => null,
        ]);

        $this->artisan('satellites:check-alerts')
            ->assertSuccessful();

        Bus::assertDispatched(SendTelegramAlert::class, function (SendTelegramAlert $job) use ($user) {
            return $job->chatId === $user->telegram_id;
        });

        $this->assertNotNull($rule->fresh()->last_notified_at);
    }

    public function test_does_not_dispatch_alert_when_satellite_is_out_of_range(): void
    {
        Bus::fake();

        $user = User::factory()->create([
            'telegram_id' => '123456789',
        ]);

        $satellite = Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => self::ISS_TLE1,
            'tle2' => self::ISS_TLE2,
        ]);

        $calculator = app(SatellitePositionCalculator::class);
        $pos = $calculator->getPosition($satellite->tle1, $satellite->tle2);
        $this->assertNotNull($pos);

        // Размещаем точку на противоположной стороне Земли с маленьким радиусом
        $farLatitude = $pos['lat'] > 0 ? -70.0 : 70.0;
        $farLongitude = $pos['lng'] > 0 ? $pos['lng'] - 180.0 : $pos['lng'] + 180.0;

        $rule = AlertRule::create([
            'user_id' => $user->id,
            'satellite_id' => $satellite->id,
            'latitude' => $farLatitude,
            'longitude' => $farLongitude,
            'radius_km' => 10,
            'is_active' => true,
            'last_notified_at' => null,
        ]);

        $this->artisan('satellites:check-alerts')
            ->assertSuccessful();

        Bus::assertNotDispatched(SendTelegramAlert::class);
        $this->assertNull($rule->fresh()->last_notified_at);
    }

    public function test_cooldown_prevents_repeated_alerts_within_four_hours(): void
    {
        Bus::fake();

        $user = User::factory()->create([
            'telegram_id' => '123456789',
        ]);

        $satellite = Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => self::ISS_TLE1,
            'tle2' => self::ISS_TLE2,
        ]);

        $calculator = app(SatellitePositionCalculator::class);
        $pos = $calculator->getPosition($satellite->tle1, $satellite->tle2);

        // Спутник в зоне, но уведомление уже отправлялось 1 час назад (< 4 часов)
        $rule = AlertRule::create([
            'user_id' => $user->id,
            'satellite_id' => $satellite->id,
            'latitude' => $pos['lat'],
            'longitude' => $pos['lng'],
            'radius_km' => 500,
            'is_active' => true,
            'last_notified_at' => now()->subHour(),
        ]);

        $this->artisan('satellites:check-alerts')
            ->assertSuccessful();

        Bus::assertNotDispatched(SendTelegramAlert::class);
    }

    public function test_user_without_telegram_id_is_skipped(): void
    {
        Bus::fake();

        $user = User::factory()->create([
            'telegram_id' => null,
        ]);

        $satellite = Satellite::create([
            'name' => 'ISS (ZARYA)',
            'catalog_number' => '25544',
            'category' => 'ISS',
            'tle1' => self::ISS_TLE1,
            'tle2' => self::ISS_TLE2,
        ]);

        $calculator = app(SatellitePositionCalculator::class);
        $pos = $calculator->getPosition($satellite->tle1, $satellite->tle2);

        AlertRule::create([
            'user_id' => $user->id,
            'satellite_id' => $satellite->id,
            'latitude' => $pos['lat'],
            'longitude' => $pos['lng'],
            'radius_km' => 500,
            'is_active' => true,
            'last_notified_at' => null,
        ]);

        $this->artisan('satellites:check-alerts')
            ->expectsOutput('No active alert rules with linked Telegram accounts found.')
            ->assertSuccessful();

        Bus::assertNotDispatched(SendTelegramAlert::class);
    }
}
