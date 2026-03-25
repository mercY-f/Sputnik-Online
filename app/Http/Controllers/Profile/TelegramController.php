<?php

namespace App\Http\Controllers\Profile;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TelegramController extends Controller
{
    public function generateToken(Request $request)
    {
        $user = $request->user();
        
        $user->telegram_link_token = Str::random(8); // e.g. a8b4c2d1
        $user->save();
        
        return back()->with('status', 'telegram-token-generated');
    }

    public function disconnect(Request $request)
    {
        $user = $request->user();
        $user->telegram_id = null;
        $user->telegram_link_token = null;
        $user->save();
        
        return back()->with('status', 'telegram-disconnected');
    }
}
