<?php

namespace App\Console\Commands;

use App\Models\Satellite;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class FetchSatellites extends Command
{
    protected $signature = 'satellites:fetch';
    protected $description = 'Fetch and cache TLE data from CelesTrak';

    // Паттерны для определения категорий спутников
    private array $categoryPatterns = [
        'ISS' => ['ZARYA'], // Только главный модуль, чтобы МКС не троилась
        'STARLINK' => ['STARLINK'],
        'ONEWEB' => ['ONEWEB'],
        'IRIDIUM' => ['IRIDIUM'],
        'NAVIGATION' => ['NAVSTAR', 'GLONASS', 'GALILEO', 'BEIDOU'],
        'WEATHER' => ['NOAA', 'GOES', 'METEOR'],
    ];

    public function handle(): int
    {
        $this->info('Fetching TLE data from CelesTrak...');

        try {
            $response = Http::timeout(60)
                ->withHeaders(['Accept' => 'text/plain'])
                ->get('https://celestrak.org/NORAD/elements/gp.php', [
                'GROUP' => 'active',
                'FORMAT' => 'tle',
            ]);

            if (!$response->successful()) {
                $this->error('Failed to fetch TLE data: ' . $response->status());
                return self::FAILURE;
            }

            $satellites = $this->parseTLE($response->body());
            $this->info('Parsed ' . count($satellites) . ' satellites. Saving to DB...');

            $saved = 0;
            foreach ($satellites as $sat) {
                Satellite::updateOrCreate(
                ['catalog_number' => $sat['catalog_number']],
                    $sat
                );
                $saved++;
            }

            $this->info("Done! Saved/updated {$saved} satellites.");
            return self::SUCCESS;

        }
        catch (\Exception $e) {
            $this->error('Error: ' . $e->getMessage());
            return self::FAILURE;
        }
    }

    private function parseTLE(string $tleData): array
    {
        $lines = array_map('trim', explode("\n", $tleData));
        $satellites = [];

        for ($i = 0; $i < count($lines) - 2; $i += 3) {
            $name = $lines[$i];
            $tle1 = $lines[$i + 1] ?? '';
            $tle2 = $lines[$i + 2] ?? '';

            if (!str_starts_with($tle1, '1 ') || !str_starts_with($tle2, '2 ')) {
                continue;
            }

            // Извлекаем номер из TLE (строка 1)
            $catalogNumber = trim(substr($tle1, 2, 5));

            $satellites[] = [
                'name' => $name,
                'catalog_number' => $catalogNumber,
                'category' => $this->detectCategory($name),
                'tle1' => $tle1,
                'tle2' => $tle2,
            ];
        }

        return $satellites;
    }

    private function detectCategory(string $name): string
    {
        $nameUpper = strtoupper($name);
        foreach ($this->categoryPatterns as $category => $patterns) {
            foreach ($patterns as $pattern) {
                if (str_contains($nameUpper, $pattern)) {
                    return $category;
                }
            }
        }
        return 'OTHER';
    }
}
