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

        $satellites = \Illuminate\Support\Facades\Cache::remember("satellites:api:{$category}:v2", 3600, function () use ($category) {
            $query = Satellite::select('id', 'name', 'catalog_number', 'tle1', 'tle2', 'category')
                ->orderBy('id');
            if ($category !== 'ALL') {
                $query->where('category', $category);
            }
            return $query->get();
        });

        return response()->json($satellites);
    }

    /**
     * Return available satellite categories with counts
     */
    public function categories()
    {
        return response()->json(\Illuminate\Support\Facades\Cache::remember('satellites:categories', 3600, function () {
            $categories = Satellite::selectRaw('category, COUNT(*) as count')
                ->groupBy('category')
                ->orderBy('count', 'desc')
                ->pluck('count', 'category');

            $allCount = Satellite::count();

            return [
                'ALL' => $allCount,
                ...$categories->toArray(),
            ];
        }));
    }
}
