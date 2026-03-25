<?php

namespace App\Http\Controllers;

use App\Models\AlertRule;
use App\Models\Satellite;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AlertRuleController extends Controller
{
    public function index(Request $request)
    {
        $rules = $request->user()->alertRules()->with('satellite:id,name,catalog_number')->get();
        // Get all satellites for the creation dropdown
        $satellites = Satellite::select('id', 'name', 'catalog_number')->orderBy('name')->get();

        return Inertia::render('AlertRules/Index', [
            'rules' => $rules,
            'satellites' => $satellites,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'satellite_id' => 'required|exists:satellites,id',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'radius_km' => 'required|integer|min:10|max:15000',
        ]);

        $request->user()->alertRules()->create(array_merge($validated, ['is_active' => true]));

        return back()->with('success', 'Правило создано');
    }

    public function update(Request $request, AlertRule $alertRule)
    {
        if ($alertRule->user_id !== $request->user()->id) {
            abort(403);
        }

        $validated = $request->validate([
            'satellite_id' => 'required|exists:satellites,id',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'radius_km' => 'required|integer|min:10|max:15000',
            'is_active' => 'boolean',
        ]);

        $alertRule->update($validated);

        return back()->with('success', 'Правило обновлено');
    }

    public function destroy(Request $request, AlertRule $alertRule)
    {
        if ($alertRule->user_id !== $request->user()->id) {
            abort(403);
        }

        $alertRule->delete();

        return back()->with('success', 'Правило удалено');
    }
}
