<?php

namespace App\Http\Controllers;

use App\Models\Satellite;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SatelliteController extends Controller
{
    /**
     * Show the globe tracker page with initial data
     */
    public function index(Request $request)
    {
        $count = Satellite::count();

        // Загружаем профиль и роль, если пользователь авторизован
        if ($request->user()) {
            $request->user()->load(['role', 'profile']);
        }

        return Inertia::render('Globe/Index', [
            'satelliteCount' => $count,
        ]);
    }

    /**
     * API endpoint: Return satellite data grouped by category (JSON)
     */
    public function api(Request $request)
    {
        $category = $request->query('category', 'ALL');

        $query = Satellite::select('id', 'name', 'tle1', 'tle2', 'category');

        if ($category !== 'ALL') {
            $query->where('category', $category);
        }

        // Ограничиваем количество для нормальной работы JS в браузере
        $satellites = $query->limit(3000)->get();

        return response()->json($satellites);
    }

    /**
     * Return available satellite categories with counts
     */
    public function categories()
    {
        $categories = Satellite::selectRaw('category, COUNT(*) as count')
            ->groupBy('category')
            ->orderBy('count', 'desc')
            ->pluck('count', 'category');

        $allCount = Satellite::count();

        return response()->json([
            'ALL' => $allCount,
            ...$categories->toArray(),
        ]);
    }
}
