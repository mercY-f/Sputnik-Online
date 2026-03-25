<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Telegram\Bot\Laravel\Facades\Telegram;

class TelegramBotController extends Controller
{
    /**
     * Handle incoming Telegram Webhook requests.
     */
    public function handleWebhook(Request $request)
    {
        try {
            // Process the incoming command or message
            $update = Telegram::commandsHandler(true);
            
            return response()->json(['status' => 'success']);
        } catch (\Exception $e) {
            \Log::error('Telegram Webhook Error: ' . $e->getMessage());
            return response()->json(['status' => 'error'], 500);
        }
    }
}
