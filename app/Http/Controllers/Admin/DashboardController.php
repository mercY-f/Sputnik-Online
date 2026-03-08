<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\User;
use App\Models\Role;
use App\Models\SatelliteCategory;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        // 1:1 (profile) and N:1 (role) relationships
        $users = User::with(['role', 'profile'])->get();

        // 1:N (satellites)
        $categories = SatelliteCategory::withCount('satellites')->get();

        // Count users per role
        $roles = Role::withCount('users')->get();

        return Inertia::render('Admin/Dashboard', [
            'users' => $users,
            'categories' => $categories,
            'roles' => $roles,
        ]);
    }
}
