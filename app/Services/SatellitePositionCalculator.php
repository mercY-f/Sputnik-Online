<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Accurate satellite position calculator using satellite.js via Node.js subprocess.
 */
class SatellitePositionCalculator
{
    private const EARTH_RADIUS = 6371.0;
    private const DEG2RAD      = M_PI / 180.0;

    /**
     * Calculate geographical position (lat, lon, alt_km) from TLE at specified UTC time.
     *
     * @return array{lat: float, lng: float, alt_km: float}|null
     */
    public function getPosition(string $tle1, string $tle2, ?\DateTime $atTime = null): ?array
    {
        $positions = $this->getPositionsBatch([['tle1' => $tle1, 'tle2' => $tle2]], $atTime);

        return $positions[0] ?? null;
    }

    /**
     * Calculate great-circle distance in km using the Haversine formula.
     */
    public function haversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $R    = self::EARTH_RADIUS;
        $dLat = ($lat2 - $lat1) * self::DEG2RAD;
        $dLng = ($lng2 - $lng1) * self::DEG2RAD;

        $a = sin($dLat / 2) ** 2
           + cos($lat1 * self::DEG2RAD) * cos($lat2 * self::DEG2RAD) * sin($dLng / 2) ** 2;

        return $R * 2.0 * asin(min(1.0, sqrt($a)));
    }

    /**
     * Calculate geographical positions in batch using satellite.js via Node.js subprocess.
     *
     * @param array<int, array{tle1: string, tle2: string}> $satellites
     * @return array<int, array{lat: float, lng: float, alt_km: float}|null>
     */
    public function getPositionsBatch(array $satellites, ?\DateTime $atTime = null): array
    {
        if (empty($satellites)) {
            return [];
        }

        $script = base_path('scripts/satellite_position.cjs');
        if (!file_exists($script)) {
            Log::error("SatellitePositionCalculator: SGP4 script not found at {$script}");
            return array_fill(0, count($satellites), null);
        }

        $payload = array_map(fn($s) => [
            'tle1' => $s['tle1'],
            'tle2' => $s['tle2'],
            'ts'   => ($atTime?->getTimestamp() ?? time()),
        ], $satellites);

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open('node ' . escapeshellarg($script) . ' --batch 2>&1', $descriptors, $pipes);
        if (!is_resource($process)) {
            Log::error('SatellitePositionCalculator: failed to spawn node process.');
            return array_fill(0, count($satellites), null);
        }

        fwrite($pipes[0], json_encode($payload));
        fclose($pipes[0]);

        $out = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        if (isset($pipes[2]) && is_resource($pipes[2])) {
            fclose($pipes[2]);
        }

        $exitCode = proc_close($process);

        $data = json_decode(trim($out), true);
        if (!is_array($data) || isset($data['error']) || count($data) !== count($satellites)) {
            Log::error('SatellitePositionCalculator: node execution failed or returned invalid data.', [
                'exit_code' => $exitCode,
                'output'    => trim($out),
            ]);
            return array_fill(0, count($satellites), null);
        }

        return array_values(array_map(function ($d) {
            if (
                is_array($d) &&
                !isset($d['error']) &&
                isset($d['lat'], $d['lng'], $d['alt_km']) &&
                is_numeric($d['lat']) &&
                is_numeric($d['lng']) &&
                is_numeric($d['alt_km'])
            ) {
                return [
                    'lat'    => (float) $d['lat'],
                    'lng'    => (float) $d['lng'],
                    'alt_km' => (float) $d['alt_km'],
                ];
            }
            return null;
        }, $data));
    }
}
