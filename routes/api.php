<?php

use App\Http\Controllers\SatelliteController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::middleware(['throttle:60,1'])->group(function () {
    Route::get('/satellites', [SatelliteController::class, 'api'])->name('satellites.api');
    Route::get('/satellite-categories', [SatelliteController::class, 'categories'])->name('satellites.categories');
});

