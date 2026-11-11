<?php

namespace App\Console\Commands;

use App\Jobs\SendTelegramAlert;
use App\Models\AlertRule;
use App\Services\SatellitePositionCalculator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CheckSatelliteAlerts extends Command
{
    protected $signature = 'satellites:check-alerts {--test : Force send notifications for all active rules (for testing)}';
    protected $description = 'Check active alert rules and send Telegram notifications when satellites are in range';

    public function handle(SatellitePositionCalculator $calculator): void
    {
        $now = new \DateTime('now', new \DateTimeZone('UTC'));

        // Load all active rules with user (who has a linked Telegram) and satellite
        $rules = AlertRule::where('is_active', true)
            ->with([
                'user' => fn($q) => $q->whereNotNull('telegram_id'),
                'satellite',
            ])
            ->get()
            ->filter(fn($rule) => $rule->user !== null);

        if ($rules->isEmpty()) {
            $this->info('No active alert rules with linked Telegram accounts found.');
            return;
        }

        $this->info("Checking {$rules->count()} active alert rule(s)...");

        $satellitesById = [];
        foreach ($rules as $rule) {
            $s = $rule->satellite;
            if ($s && $s->tle1 && $s->tle2) {
                $satellitesById[$s->id] = $s;
            }
        }

        $positions = $calculator->getPositionsBatch(
            array_map(fn($s) => ['tle1' => $s->tle1, 'tle2' => $s->tle2], array_values($satellitesById)),
            $now
        );

        $positionById = [];
        foreach (array_keys($satellitesById) as $index => $id) {
            $positionById[$id] = $positions[$index] ?? null;
        }

        // PostGIS path: persist sub-satellite points and resolve "in zone" set-wise.
        // Non-pgsql drivers (sqlite test DB) keep the in-PHP haversine fallback.
        $usePostgis = $this->isPostgisAvailable();
        $zoneInfo   = [];

        if ($usePostgis) {
            $this->storeSubpoints($positionById, $now);
            $zoneInfo = $this->fetchZoneInfo($rules->modelKeys(), (bool) $this->option('test'));
        }

        foreach ($rules as $rule) {
            $satellite = $rule->satellite;

            if (!$satellite || !$satellite->tle1 || !$satellite->tle2) {
                $this->warn("Satellite #{$satellite?->id} has no TLE data. Skipping.");
                continue;
            }

            $position = $positionById[$rule->satellite->id] ?? null;

            if (!$position) {
                $this->warn("Could not compute position for satellite {$satellite->name}.");
                continue;
            }

            if (isset($zoneInfo[$rule->id])) {
                $distanceKm = $zoneInfo[$rule->id]['distance_km'];
                $inRange    = $zoneInfo[$rule->id]['in_zone'];
                $source     = 'postgis';
            } else {
                $distanceKm = $calculator->haversineDistance(
                    $rule->latitude, $rule->longitude,
                    $position['lat'], $position['lng']
                );
                $inRange = $distanceKm <= $rule->radius_km;
                $source  = 'haversine';
            }

            $this->line("  [{$satellite->name}] at lat={$position['lat']}, lng={$position['lng']} | Distance to rule point: " . round($distanceKm) . " km (rule radius: {$rule->radius_km} km, {$source})");

            $onCooldown = $rule->last_notified_at && $rule->last_notified_at->diffInHours(now()) < 4;

            if ($inRange || $this->option('test')) {
                if ($onCooldown && !$this->option('test')) {
                    $this->line("  ⏳ In range but on cooldown (last sent {$rule->last_notified_at->diffForHumans()}). Skipping.");
                    continue;
                }
                if ($this->option('test')) {
                    $this->info("  ⚡ TEST MODE: forcing notification regardless of distance.");
                }
                SendTelegramAlert::dispatch($rule->user->telegram_id, $this->buildAlertText($rule, $satellite, $position, $distanceKm));
                $this->info("  📤 Queued Telegram alert for user #{$rule->user->id} ({$rule->user->name}) via Telegram!");
                // Update last notified time
                if (!$this->option('test')) {
                    $rule->update(['last_notified_at' => now()]);
                }
            }
        }

        $this->info('Done.');
    }

    private function isPostgisAvailable(): bool
    {
        return DB::connection()->getDriverName() === 'pgsql';
    }

    /**
     * Upsert the freshly computed sub-satellite points into satellite_subpoints
     * in a single statement (ST_MakePoint takes longitude first, then latitude).
     *
     * @param array<int, array{lat: float, lng: float, alt_km: float}|null> $positionById
     */
    private function storeSubpoints(array $positionById, \DateTime $now): void
    {
        $rows = [];
        foreach ($positionById as $satelliteId => $position) {
            if (!$position || !isset($position['lat'], $position['lng'])) {
                continue;
            }

            $rows[] = [
                'id'     => (int) $satelliteId,
                'lat'    => (float) $position['lat'],
                'lng'    => (float) $position['lng'],
                'alt_km' => isset($position['alt_km']) ? (float) $position['alt_km'] : null,
            ];
        }

        if ($rows === []) {
            return;
        }

        try {
            DB::statement(
                <<<'SQL'
                INSERT INTO satellite_subpoints (satellite_id, position, alt_km, computed_at)
                SELECT s.id,
                       ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography,
                       s.alt_km,
                       ?::timestamp
                FROM jsonb_to_recordset(?::jsonb)
                     AS s(id bigint, lat double precision, lng double precision, alt_km real)
                ON CONFLICT (satellite_id) DO UPDATE
                   SET position    = EXCLUDED.position,
                       alt_km      = EXCLUDED.alt_km,
                       computed_at = EXCLUDED.computed_at
                SQL,
                [$now->format('Y-m-d H:i:s'), json_encode($rows)]
            );
        } catch (\Throwable $e) {
            Log::warning('CheckSatelliteAlerts: failed to upsert satellite_subpoints, falling back to haversine.', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Resolve distance/containment for all rules in one query using ST_DWithin + ST_Distance.
     *
     * @param  int[] $ruleIds
     * @return array<int, array{distance_km: float, in_zone: bool}>
     */
    private function fetchZoneInfo(array $ruleIds, bool $force = false): array
    {
        if ($ruleIds === []) {
            return [];
        }

        try {
            $rows = DB::select(
                <<<'SQL'
                SELECT ar.id AS rule_id,
                       ST_Distance(sp.position, ar.zone) AS distance_m,
                       (ST_DWithin(sp.position, ar.zone, ar.radius_km * 1000) OR ?::boolean) AS in_zone
                FROM alert_rules ar
                JOIN satellite_subpoints sp ON sp.satellite_id = ar.satellite_id
                WHERE ar.is_active = true
                  AND ar.id = ANY(?::bigint[])
                SQL,
                [$force, '{' . implode(',', array_map('intval', $ruleIds)) . '}']
            );
        } catch (\Throwable $e) {
            Log::warning('CheckSatelliteAlerts: PostGIS zone query failed, falling back to haversine.', [
                'error' => $e->getMessage(),
            ]);

            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            $result[(int) $row->rule_id] = [
                'distance_km' => ((float) $row->distance_m) / 1000.0,
                'in_zone'     => $row->in_zone === true || $row->in_zone === 't' || $row->in_zone === 1,
            ];
        }

        return $result;
    }

    private function buildAlertText($rule, $satellite, $position, $distance): string
    {
        $satName = htmlspecialchars($satellite->name);
        $dist    = round($distance);
        $lat     = $position['lat'];
        $lng     = $position['lng'];
        $alt     = $position['alt_km'];

        return "🚨 <b>Спутник рядом!</b>\n\n"
            . "🛰️ <b>{$satName}</b> сейчас пролетает над вашей зоной наблюдения!\n\n"
            . "📍 Текущая позиция спутника:\n"
            . "  Широта: <b>{$lat}°</b>\n"
            . "  Долгота: <b>{$lng}°</b>\n"
            . "  Высота: <b>{$alt} км</b>\n\n"
            . "📏 Расстояние до вашей точки: <b>{$dist} км</b>\n"
            . "🟢 Радиус вашей зоны: <b>{$rule->radius_km} км</b>\n\n"
            . "<i>Уведомление от Earth Orbit Live 🌍</i>";
    }
}
