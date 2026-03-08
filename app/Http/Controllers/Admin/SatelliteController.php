<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Satellite;
use App\Models\SatelliteCategory;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Gate;

class SatelliteController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        // Проверка прав на чтение (дополнительная подстраховка к middleware)
        if (!$request->user()->hasPrivilege('read')) {
            abort(403, 'Unauthorized action.');
        }

        // Пагинация списка спутников
        $satellites = Satellite::orderBy('catalog_number', 'asc')
            ->paginate(100);

        return Inertia::render('Admin/Satellites/Index', [
            'satellites' => $satellites
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Request $request, Satellite $satellite)
    {
        if (!$request->user()->hasPrivilege('edit')) {
            abort(403, 'Unauthorized action.');
        }

        $categories = SatelliteCategory::all();

        return Inertia::render('Admin/Satellites/Edit', [
            'satellite' => $satellite,
            'categories' => $categories
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Satellite $satellite)
    {
        if (!$request->user()->hasPrivilege('edit')) {
            abort(403, 'Unauthorized action.');
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'category' => 'nullable|string|max:255',
            'catalog_number' => 'required|numeric',
            'tle1' => 'required|string|max:255',
            'tle2' => 'required|string|max:255',
        ]);

        $satellite->update($validated);

        // Сброс кеша после обновления
        $satellite->clearCache();

        return redirect()->route('admin.satellites.index')
            ->with('message', 'Satellite updated successfully');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Satellite $satellite)
    {
        if (!$request->user()->hasPrivilege('delete')) {
            abort(403, 'Unauthorized action.');
        }

        $satellite->clearCache();
        $satellite->delete();

        return redirect()->route('admin.satellites.index')
            ->with('message', 'Satellite deleted successfully');
    }
}
