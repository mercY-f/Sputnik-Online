<?php

namespace App\Console\Commands\Telegram;

use Telegram\Bot\Commands\Command;
use App\Models\User;

class LinkCommand extends Command
{
    /**
     * @var string Command Name
     */
    protected string $name = 'link';

    /**
     * @var string Command Description
     */
    protected string $description = 'Привязать Telegram к вашему аккаунту на сайте (Использование: /link <TOKEN>)';

    /**
     * {@inheritdoc}
     */
    public function handle()
    {
        $text = $this->getUpdate()->getMessage()->getText();
        
        // Remove the command name from the text to get arguments
        $arguments = trim(str_replace('/link', '', $text));
        
        if (empty($arguments)) {
            $this->replyWithMessage([
                'text' => 'Пожалуйста, укажите ваш токен. Пример: /link 12345678',
            ]);
            return;
        }

        $token = trim($arguments);
        $telegramId = $this->getUpdate()->getMessage()->getFrom()->getId();

        // 1. Check if this Telegram ID is already linked
        $existingLinkedUser = User::where('telegram_id', $telegramId)->first();
        if ($existingLinkedUser) {
             $this->replyWithMessage([
                'text' => "Ваш Telegram уже привязан к аккаунту: {$existingLinkedUser->email}",
            ]);
            return;
        }

        // 2. Find user by token
        $user = User::where('telegram_link_token', $token)->first();

        if (!$user) {
             $this->replyWithMessage([
                'text' => '❌ Неверный токен. Вы можете получить новый токен в настройках профиля на сайте.',
            ]);
            return;
        }

        // 3. Link account
        $user->telegram_id = $telegramId;
        $user->telegram_link_token = null; // Invalidate token after use
        $user->save();

        $this->replyWithMessage([
            'text' => "✅ Успешно! Ваш Telegram привязан к аккаунту {$user->email}. Теперь вы сможете получать уведомления о спутниках.",
        ]);
    }
}
