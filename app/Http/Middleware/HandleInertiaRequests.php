<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user() ? array_merge($request->user()->toArray(), [
                    'role' => $request->user()->load('role.privileges')->role,
                    'privileges' => $request->user()->role ? $request->user()->role->privileges->pluck('name') : [],
                    'telegram_id' => $request->user()->telegram_id,
                    'telegram_link_token' => $request->user()->telegram_link_token,
                ]) : null,
            ],
        ];
    }
}
