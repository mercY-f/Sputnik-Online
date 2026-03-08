<?php

namespace App\Services;

use App\Interfaces\SatelliteDataProviderInterface;
use Illuminate\Support\Facades\Http;

class CelestrakService implements SatelliteDataProviderInterface
{
    protected string $baseUrl = 'https://celestrak.org/NORAD/elements/gp.php';

    /**
     * Получение TLE данных для одного спутника по его номеру в каталоге.
     *
     * @param int|string $catalogNumber
     * @return array|null Массив с TLE данными или null
     */
    public function fetchTleByCatalogNumber($catalogNumber): ?array
    {
        $response = Http::get($this->baseUrl, [
            'CATNR' => $catalogNumber,
            'FORMAT' => 'json'
        ]);

        if ($response->successful() && !empty($response->json())) {
            $data = $response->json()[0] ?? null;
            if ($data) {
                return [
                    'name' => $data['OBJECT_NAME'],
                    'catalog_number' => $data['NORAD_CAT_ID'],
                    'tle1' => $data['TLE_LINE1'],
                    'tle2' => $data['TLE_LINE2'],
                ];
            }
        }

        return null;
    }

    /**
     * Получение TLE данных для группы спутников по категории.
     *
     * @param string $categoryName
     * @return array Массив с TLE данными
     */
    public function fetchTleByCategoryGroup(string $categoryName): array
    {
        // CelesTrak использует специфичные названия групп, например 'weather', 'stations'
        $response = Http::get($this->baseUrl, [
            'GROUP' => strtolower($categoryName),
            'FORMAT' => 'json'
        ]);

        $results = [];

        if ($response->successful() && is_array($response->json())) {
            foreach ($response->json() as $data) {
                $results[] = [
                    'name' => $data['OBJECT_NAME'],
                    'catalog_number' => $data['NORAD_CAT_ID'],
                    'tle1' => $data['TLE_LINE1'],
                    'tle2' => $data['TLE_LINE2'],
                ];
            }
        }

        return $results;
    }
}
