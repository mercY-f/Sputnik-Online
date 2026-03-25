<?php

namespace App\Console\Commands\Telegram;

use Telegram\Bot\Commands\Command;
use Telegram\Bot\Laravel\Facades\Telegram;

class StartCommand extends Command
{
    /**
     * @var string Command Name
     */
    protected string $name = 'start';

    /**
     * @var string Command Description
     */
    protected string $description = 'Start Command to get you started';

    /**
     * {@inheritdoc}
     */
    public function handle()
    {
        // This will send a message using `sendMessage` method behind the scenes to
        // the user/chat id who triggered this command.
        // `replyWithMessage` is available in the `Command` class.
        $response = $this->replyWithMessage([
            'text' => 'Добро пожаловать в бота Earth Orbit Live! 🌍🛰️',
        ]);
        
        // This will update the chat status to typing...
        $this->replyWithChatAction(['action' => 'typing']);
        
        $this->replyWithMessage([
            'text' => 'Я помогу тебе получать уведомления о приближении спутников. Введи /help чтобы узнать, что я умею.'
        ]);
    }
}
