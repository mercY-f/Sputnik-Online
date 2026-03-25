<?php

namespace App\Console\Commands;

use App\Models\AlertRule;
use App\Services\SatellitePositionCalculator;
use Illuminate\Console\Command;
use Telegram\Bot\Laravel\Facades\Telegram;

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

        foreach ($rules as $rule) {
            $satellite = $rule->satellite;

            if (!$satellite || !$satellite->tle1 || !$satellite->tle2) {
                $this->warn("Satellite #{$satellite?->id} has no TLE data. Skipping.");
                continue;
            }

            $position = $calculator->getPosition($satellite->tle1, $satellite->tle2, $now);

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
                $this->sendTelegramAlert($rule, $satellite, $position, $distanceKm);
                // Update last notified time
                if (!$this->option('test')) {
                    $rule->update(['last_notified_at' => now()]);
                }
            }
        }

        $this->info('Done.');
    }

    private function sendTelegramAlert(AlertRule $rule, $satellite, array $position, float $distance): void
    {
        $userName = $rule->user->name;
        $satName  = htmlspecialchars($satellite->name);
        $dist     = round($distance);
        $lat      = $position['lat'];
        $lng      = $position['lng'];
        $alt      = $position['alt_km'];

        $text = "🚨 <b>Спутник рядом!</b>\n\n"
            . "🛰️ <b>{$satName}</b> сейчас пролетает над вашей зоной наблюдения!\n\n"
            . "📍 Текущая позиция спутника:\n"
            . "  Широта: <b>{$lat}°</b>\n"
            . "  Долгота: <b>{$lng}°</b>\n"
            . "  Высота: <b>{$alt} км</b>\n\n"
            . "📏 Расстояние до вашей точки: <b>{$dist} км</b>\n"
            . "🟢 Радиус вашей зоны: <b>{$rule->radius_km} км</b>\n\n"
            . "<i>Уведомление от Earth Orbit Live 🌍</i>";

        try {
            Telegram::sendMessage([
                'chat_id'    => $rule->user->telegram_id,
                'text'       => $text,
                'parse_mode' => 'HTML',
            ]);
            $this->info("  ✅ Notification sent to user #{$rule->user->id} ({$userName}) via Telegram!");
        } catch (\Exception $e) {
            $this->error("  ❌ Failed to send Telegram message: " . $e->getMessage());
        }
    }
}
