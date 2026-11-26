<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendTelegramAlert implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = [30, 60, 120];
    public $timeout = 30;

    public function __construct(
        public string $chatId,
        public string $text
    ) {
    }

    public function handle(): void
    {
        \Telegram\Bot\Laravel\Facades\Telegram::sendMessage(['chat_id' => $this->chatId, 'text' => $this->text, 'parse_mode' => 'HTML']);
    }
}
