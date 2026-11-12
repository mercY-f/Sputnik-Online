<?php

namespace App\Console\Commands;

use App\Models\Satellite;
use App\Support\SatelliteCache;
use App\Support\SatelliteMetadata;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class EnrichSatellites extends Command
{
    protected $signature = 'satellites:enrich
                            {--file= : Path to local CSV file instead of fetching from network}
                            {--url= : Custom URL to fetch SATCAT CSV from}';

    protected $description = 'Enrich satellite catalog with country, launch date, purpose, and SATCAT metadata';

    public const PRIMARY_URL = 'https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=csv';
    public const FALLBACK_URL = 'https://celestrak.org/pub/satcat.csv';

    public function handle(): int
    {
        $this->info('Starting satellite metadata enrichment...');

        $csvContent = $this->getCsvContent();
        if ($csvContent === null) {
            $this->error('Could not obtain SATCAT CSV data.');
            return self::FAILURE;
        }

        $satcatMap = $this->parseSatcatCsv($csvContent);
        $this->info(sprintf('Parsed %d SATCAT records from source.', count($satcatMap)));

        $totalSatellites = Satellite::count();
        $this->info(sprintf('Processing %d satellites from database in batches of 1000...', $totalSatellites));

        $processed = 0;
        $enriched = 0;

        Satellite::query()
            ->select(['id', 'name', 'catalog_number', 'category', 'tle1', 'tle2', 'country', 'country_name', 'launch_date', 'launch_site', 'purpose', 'object_type', 'decay_date', 'rcs_size'])
            ->chunkById(1000, function ($satellites) use ($satcatMap, &$processed, &$enriched) {
                $batch = [];
                $now = now();

                foreach ($satellites as $sat) {
                    $catNum = (string)$sat->catalog_number;
                    $catNumStripped = ltrim($catNum, '0');
                    $meta = $satcatMap[$catNum] ?? $satcatMap[$catNumStripped] ?? null;

                    $country = $meta['country'] ?? $sat->country;
                    $countryName = $country !== null ? SatelliteMetadata::getCountryName($country) : $sat->country_name;
                    $launchDate = $meta['launch_date'] ?? ($sat->launch_date?->format('Y-m-d'));
                    $launchSite = $meta['launch_site'] ?? $sat->launch_site;
                    $objectType = $meta['object_type'] ?? $sat->object_type;
                    $decayDate = $meta['decay_date'] ?? ($sat->decay_date?->format('Y-m-d'));
                    $rcsSize = $meta['rcs_size'] ?? $sat->rcs_size;
                    $purpose = SatelliteMetadata::getPurpose($sat->name, $sat->category, $objectType);

                    if ($country !== null || $launchDate !== null || $purpose !== null) {
                        $enriched++;
                    }

                    $batch[] = [
                        'id' => $sat->id,
                        'name' => $sat->name,
                        'catalog_number' => $sat->catalog_number,
                        'category' => $sat->category,
                        'tle1' => $sat->tle1,
                        'tle2' => $sat->tle2,
                        'country' => $country,
                        'country_name' => $countryName,
                        'launch_date' => $launchDate,
                        'launch_site' => $launchSite,
                        'purpose' => $purpose,
                        'object_type' => $objectType,
                        'decay_date' => $decayDate,
                        'rcs_size' => $rcsSize,
                        'updated_at' => $now,
                    ];
                }

                DB::transaction(function () use ($batch) {
                    Satellite::upsert(
                        $batch,
                        ['catalog_number'],
                        [
                            'country',
                            'country_name',
                            'launch_date',
                            'launch_site',
                            'purpose',
                            'object_type',
                            'decay_date',
                            'rcs_size',
                            'updated_at',
                        ]
                    );
                });

                $processed += count($batch);
                $this->output->write(".");
            });

        $this->newLine();
        SatelliteCache::forgetCatalog();

        $this->info(sprintf('Enrichment finished. Processed: %d, Enriched: %d.', $processed, $enriched));
        return self::SUCCESS;
    }

    public function getCsvContent(): ?string
    {
        $localFile = $this->option('file');
        if ($localFile) {
            if (!file_exists($localFile)) {
                $this->error("Local file not found: {$localFile}");
                return null;
            }
            return file_get_contents($localFile);
        }

        $url = $this->option('url') ?: self::PRIMARY_URL;
        $this->info("Fetching SATCAT from: {$url}");

        try {
            $response = Http::timeout(60)
                ->withHeaders(['Accept' => 'text/csv, text/plain, */*'])
                ->get($url);

            if ($response->successful() && strlen($response->body()) > 100) {
                return $response->body();
            }

            $this->warn("Primary URL returned status {$response->status()}. Trying fallback URL...");
        } catch (\Throwable $e) {
            $this->warn("Failed to fetch from {$url}: {$e->getMessage()}. Trying fallback...");
        }

        try {
            $response = Http::timeout(60)
                ->withHeaders(['Accept' => 'text/csv, text/plain, */*'])
                ->get(self::FALLBACK_URL);

            if ($response->successful() && strlen($response->body()) > 100) {
                return $response->body();
            }
        } catch (\Throwable $e) {
            $this->error("Fallback fetch failed: {$e->getMessage()}");
        }

        return null;
    }

    public function parseSatcatCsv(string $csvContent): array
    {
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, $csvContent);
        rewind($stream);

        $header = fgetcsv($stream);
        if (!$header) {
            fclose($stream);
            return [];
        }

        $header = array_map(fn($col) => strtoupper(trim((string)$col)), $header);
        $headerMap = array_flip($header);

        $noradIdx = $headerMap['NORAD_CAT_ID'] ?? null;
        $ownerIdx = $headerMap['OWNER'] ?? null;
        $typeIdx = $headerMap['OBJECT_TYPE'] ?? null;
        $launchDateIdx = $headerMap['LAUNCH_DATE'] ?? null;
        $launchSiteIdx = $headerMap['LAUNCH_SITE'] ?? null;
        $decayDateIdx = $headerMap['DECAY_DATE'] ?? null;
        $rcsIdx = $headerMap['RCS'] ?? null;

        if ($noradIdx === null) {
            fclose($stream);
            return [];
        }

        $results = [];
        while (($row = fgetcsv($stream)) !== false) {
            if (!isset($row[$noradIdx])) {
                continue;
            }

            $norad = trim((string)$row[$noradIdx]);
            if ($norad === '' || !is_numeric($norad)) {
                continue;
            }

            $owner = isset($ownerIdx, $row[$ownerIdx]) ? trim((string)$row[$ownerIdx]) : '';
            $objectType = isset($typeIdx, $row[$typeIdx]) ? trim((string)$row[$typeIdx]) : '';
            $launchDate = isset($launchDateIdx, $row[$launchDateIdx]) ? trim((string)$row[$launchDateIdx]) : '';
            $launchSite = isset($launchSiteIdx, $row[$launchSiteIdx]) ? trim((string)$row[$launchSiteIdx]) : '';
            $decayDate = isset($decayDateIdx, $row[$decayDateIdx]) ? trim((string)$row[$decayDateIdx]) : '';
            $rcs = isset($rcsIdx, $row[$rcsIdx]) ? trim((string)$row[$rcsIdx]) : '';

            $results[$norad] = [
                'country' => $owner !== '' ? $owner : null,
                'object_type' => $objectType !== '' ? $objectType : null,
                'launch_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $launchDate) ? $launchDate : null,
                'launch_site' => $launchSite !== '' ? $launchSite : null,
                'decay_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $decayDate) ? $decayDate : null,
                'rcs_size' => $rcs !== '' ? $rcs : null,
            ];
        }

        fclose($stream);
        return $results;
    }
}
