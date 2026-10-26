<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\SatelliteCategory;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = ['ISS', 'STARLINK', 'ONEWEB', 'IRIDIUM', 'NAVIGATION', 'WEATHER', 'TELESCOPE', 'OTHER'];
        foreach ($categories as $cat) {
            SatelliteCategory::firstOrCreate(['name' => $cat]);
        }
        $this->command->info('Satellite categories seeded!');
    }
}
