<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SatelliteController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\SatelliteController as AdminSatelliteController;
use App\Http\Controllers\API\SatelliteAPIController;
use Illuminate\Support\Facades\Route;

// Globe Tracker - public main page
Route::get('/', [SatelliteController::class , 'index'])->name('home');

// Satellite data API (no auth required)
Route::prefix('api')->group(function () {
    Route::get('/satellites', [SatelliteController::class , 'api'])->name('satellites.api');
    Route::get('/satellite-categories', [SatelliteController::class , 'categories'])->name('satellites.categories');
});

// Private API
Route::prefix('api')->middleware('auth')->group(function () {
    Route::get('/user/favorites', [SatelliteAPIController::class , 'getFavorites'])->name('api.favorites.get');
    Route::post('/user/favorites/{id}/toggle', [SatelliteAPIController::class , 'toggleFavorite'])->name('api.favorites.toggle');
});

// Admin Dashboard - protected by auth and role middleware
Route::middleware(['auth', 'verified', \App\Http\Middleware\EnsureRole::class . ':admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/dashboard', [DashboardController::class , 'index'])->name('dashboard');

    // Satellites CRUD
    Route::get('/satellites', [AdminSatelliteController::class , 'index'])->name('satellites.index');
    Route::get('/satellites/{satellite}/edit', [AdminSatelliteController::class , 'edit'])->name('satellites.edit');
    Route::put('/satellites/{satellite}', [AdminSatelliteController::class , 'update'])->name('satellites.update');
    Route::delete('/satellites/{satellite}', [AdminSatelliteController::class , 'destroy'])->name('satellites.destroy');
});

// Dashboard redirects to home for authenticated users
Route::get('/dashboard', [SatelliteController::class , 'index'])
    ->middleware(['auth', 'verified'])
    ->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class , 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class , 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class , 'destroy'])->name('profile.destroy');
});

require __DIR__ . '/auth.php';
