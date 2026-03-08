<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use Illuminate\Support\Facades\Auth;

class SatelliteAPIController extends Controller
{
    /**
     * Get the authenticated user's favorite satellites (N:M relationship)
     */
    public function getFavorites(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Fetch user with favorite satellites (BelongsToMany)
        $userWithFavorites = $user->load('favoriteSatellites.category');

        return response()->json([
            'favorites' => $userWithFavorites->favoriteSatellites
        ]);
    }

    /**
     * Toggle a satellite in the user's favorites
     */
    public function toggleFavorite(Request $request, $satelliteId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // N:M Pivot table sync without detaching
        $user->favoriteSatellites()->toggle($satelliteId);

        return response()->json(['success' => true]);
    }
}
