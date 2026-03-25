<?php

namespace App\Console\Commands\Telegram;

use Telegram\Bot\Commands\Command;
use App\Models\Satellite;

class SearchCommand extends Command
{
    /**
     * @var string Command Name
     */
    protected string $name = 'search';

    /**
     * @var string Command Description
     */
    protected string $description = 'Поиск спутника по имени или NORAD ID (Использование: /search <имя или ID>)';

    /**
     * {@inheritdoc}
     */
    public function handle()
    {
        try {
            $text = $this->getUpdate()->getMessage()->getText();
            $query = trim(str_replace('/search', '', $text));

            if (empty($query)) {
                $this->replyWithMessage([
                    'text' => 'Пожалуйста, укажите имя спутника или его NORAD ID. Пример: /search ISS',
                ]);
                return;
            }

            $this->replyWithChatAction(['action' => 'typing']);

            // Search by NORAD ID/Catalog Number first (exact match)
            if (is_numeric($query)) {
                $satellites = Satellite::where('catalog_number', $query)->get();
            } else {
                // Search by name (partial match)
                $satellites = Satellite::where('name', 'like', "%{$query}%")->limit(5)->get();
            }

            if ($satellites->isEmpty()) {
                $this->replyWithMessage([
                    'text' => "Спутники по запросу '{$query}' не найдены. 🛰️",
                ]);
                return;
            }

            $responseText = "🔎 Результаты поиска по '{$query}':\n\n";

            foreach ($satellites as $satellite) {
                // Escape HTML chars
                $name = htmlspecialchars($satellite->name);
                $catName = htmlspecialchars($satellite->category ?? 'N/A');

                $responseText .= "🛰️ <b>{$name}</b>\n";
                $responseText .= "🆔 NORAD ID: {$satellite->catalog_number}\n";
                $responseText .= "🌍 Категория: {$catName}\n";
                
                $url = url("/?satellite={$satellite->catalog_number}");
                $responseText .= "🔗 <a href='{$url}'>Посмотреть на орбите</a>\n\n";
            }

            $this->replyWithMessage([
                'text' => $responseText,
                'parse_mode' => 'HTML',
            ]);
        } catch (\Exception $e) {
            $this->replyWithMessage([
                'text' => "❌ Ошибка скрипта: " . $e->getMessage(),
            ]);
        }
    }
}
