<?php

use App\Console\Commands\FetchSatellites;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

// Fetch TLE satellite data twice a day
Schedule::command('satellites:fetch')->twiceDaily(1, 13);
