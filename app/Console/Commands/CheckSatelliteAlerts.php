<?php

namespace App\Console\Commands;

use App\Jobs\SendTelegramAlert;
use App\Models\AlertRule;
use App\Services\SatellitePositionCalculator;
use Illuminate\Console\Command;

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

            $distanceKm = $calculator->haversineDistance(
                $rule->latitude, $rule->longitude,
                $position['lat'], $position['lng']
            );

            $this->line("  [{$satellite->name}] at lat={$position['lat']}, lng={$position['lng']} | Distance to rule point: " . round($distanceKm) . " km (rule radius: {$rule->radius_km} km)");

            $inRange = $distanceKm <= $rule->radius_km;
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
