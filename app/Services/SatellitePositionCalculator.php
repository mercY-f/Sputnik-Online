<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Accurate satellite position calculator using satellite.js via Node.js subprocess.
 * Falls back to built-in simplified SGP4 if Node.js is unavailable.
 */
class SatellitePositionCalculator
{
    private const EARTH_RADIUS = 6371.0;
    private const DEG2RAD     = M_PI / 180.0;

    /**
     * Calculate geographical position (lat, lon, alt_km) from TLE at current UTC time.
     */
    public function getPosition(string $tle1, string $tle2, ?\DateTime $atTime = null): ?array
    {
        // Try accurate calculation via Node.js / satellite.js first
        $result = $this->getPositionViaNode($tle1, $tle2, $atTime);
        if ($result !== null) {
            return $result;
        }

        // Fallback to PHP simplified SGP4 (less accurate)
        Log::warning('SatellitePositionCalculator: node/satellite.js unavailable, using simplified SGP4 fallback (reduced accuracy).');
        return $this->getPositionFallback($tle1, $tle2, $atTime);
    }

    /**
     * Use Node.js + satellite.js for accurate SGP4 propagation.
     */
    private function getPositionViaNode(string $tle1, string $tle2, ?\DateTime $atTime = null): ?array
    {
        $script = base_path('scripts/satellite_position.cjs');
        if (!file_exists($script)) {
            return null;
        }

        // Escape arguments for command line
        $t1 = escapeshellarg($tle1);
        $t2 = escapeshellarg($tle2);

        $ts = $atTime?->getTimestamp() ?? time();

        $output = shell_exec("node {$script} {$t1} {$t2} {$ts} 2>&1");

        if (!$output) {
            return null;
        }

        $data = json_decode(trim($output), true);
        if (!$data || isset($data['error'])) {
            return null;
        }

        return [
            'lat'    => (float) $data['lat'],
            'lng'    => (float) $data['lng'],
            'alt_km' => (float) $data['alt_km'],
        ];
    }

    /**
     * Fallback: simplified SGP4 with J2 perturbations (pure PHP).
     * Less accurate but works without Node.js.
     */
    private function getPositionFallback(string $tle1, string $tle2, ?\DateTime $atTime = null): ?array
    {
        try {
            if (!$atTime) {
                $atTime = new \DateTime('now', new \DateTimeZone('UTC'));
            }

            $epochYear = (int) substr($tle1, 18, 2);
            $epochDay  = (float) substr($tle1, 20, 12);

            $inclinationDeg   = (float) substr($tle2, 8, 8);
            $raanDeg          = (float) substr($tle2, 17, 8);
            $eccentricity     = (float) ('0.' . trim(substr($tle2, 26, 7)));
            $argPerigeeDeg    = (float) substr($tle2, 34, 8);
            $meanAnomalyDeg   = (float) substr($tle2, 43, 8);
            $meanMotionRevDay = (float) substr($tle2, 52, 11);

            $fullYear = ($epochYear >= 57) ? (1900 + $epochYear) : (2000 + $epochYear);
            $epochTs  = gmmktime(0, 0, 0, 1, 0, $fullYear) + ($epochDay - 1) * 86400.0;
            $tsec     = $atTime->getTimestamp() - $epochTs;

            $n0  = $meanMotionRevDay * 2 * M_PI / 86400.0;
            $a   = pow(398600.4418 / ($n0 * $n0), 1.0 / 3.0);
            $inc = $inclinationDeg * self::DEG2RAD;
            $p   = $a * (1 - $eccentricity * $eccentricity);

            $j2f = 1.5 * 0.0010826257 * pow(6378.137 / $p, 2);
            $nCorr = $n0 * (1 + $j2f * sqrt(1 - $eccentricity ** 2) * (1 - 1.5 * sin($inc) ** 2));
            $raanRad = ($raanDeg * self::DEG2RAD) - $j2f * $n0 * cos($inc) * $tsec;
            $argpRad = ($argPerigeeDeg * self::DEG2RAD) + $j2f * $n0 * (1 - 2.5 * sin($inc) ** 2) * $tsec;

            $M = fmod(($meanAnomalyDeg * self::DEG2RAD) + $nCorr * $tsec, 2 * M_PI);
            if ($M < 0) $M += 2 * M_PI;

            $E = $M;
            for ($i = 0; $i < 50; $i++) {
                $dE = ($E - $eccentricity * sin($E) - $M) / (1.0 - $eccentricity * cos($E));
                $E -= $dE;
                if (abs($dE) < 1e-12) break;
            }

            $nu = 2.0 * atan2(sqrt(1 + $eccentricity) * sin($E / 2), sqrt(1 - $eccentricity) * cos($E / 2));
            $r  = $a * (1.0 - $eccentricity * cos($E));
            $u  = $nu + $argpRad;

            $xEci = $r * (cos($raanRad) * cos($u) - sin($raanRad) * sin($u) * cos($inc));
            $yEci = $r * (sin($raanRad) * cos($u) + cos($raanRad) * sin($u) * cos($inc));
            $zEci = $r * (sin($u) * sin($inc));

            $J2000 = ($atTime->getTimestamp() - 946728000.0) / 86400.0;
            $GMST  = fmod(280.46061837 + 360.98564736629 * $J2000, 360.0) * self::DEG2RAD;

            $xEcef = $xEci * cos($GMST) + $yEci * sin($GMST);
            $yEcef = -$xEci * sin($GMST) + $yEci * cos($GMST);
            $zEcef = $zEci;

            return [
                'lat'    => round(atan2($zEcef, sqrt($xEcef ** 2 + $yEcef ** 2)) * (180 / M_PI), 4),
                'lng'    => round(atan2($yEcef, $xEcef) * (180 / M_PI), 4),
                'alt_km' => round($r - self::EARTH_RADIUS, 1),
            ];
        } catch (\Throwable $e) {
            return null;
        }
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
     */
    public function getPositionsBatch(array $satellites, ?\DateTime $atTime = null): array
    {
        $script = base_path('scripts/satellite_position.cjs');
        if (!file_exists($script)) {
            return array_fill(0, count($satellites), null);
        }

        if (empty($satellites)) {
            return [];
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
            return array_fill(0, count($satellites), null);
        }

        fwrite($pipes[0], json_encode($payload));
        fclose($pipes[0]);

        $out = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        if (isset($pipes[2]) && is_resource($pipes[2])) {
            fclose($pipes[2]);
        }

        proc_close($process);

        $data = json_decode(trim($out), true);
        if (!is_array($data) || isset($data['error']) || count($data) !== count($satellites)) {
            return array_fill(0, count($satellites), null);
        }

        return array_values(array_map(function ($d) {
            if (is_array($d) && !isset($d['error'])) {
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
