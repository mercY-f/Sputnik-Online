<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Telegram\Bot\Laravel\Facades\Telegram;

class TelegramPollCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'telegram:poll';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Polls Telegram for new messages (Local environment only)';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Starting Telegram polling... Press Ctrl+C to stop.');
        
        // Remove potentially existing webhook to enable polling
        Telegram::removeWebhook();

        $lastUpdateId = 0;

        while (true) {
            try {
                // Fetch updates starting from the next expected update ID
                $updates = Telegram::getUpdates([
                    'offset' => $lastUpdateId + 1,
                    'limit' => 100,
                    'timeout' => 30 // Long polling (waits 30s before returning empty)
                ]);

                if (is_array($updates) && count($updates) > 0) {
                    foreach ($updates as $update) {
                        if ($update === false) {
                            continue;
                        }
                        
                        // $update is a Telegram\Bot\Objects\Update which acts as a Collection
                        $updateId = $update['update_id'] ?? $update->get('update_id');
                        
                        if (!$updateId && method_exists($update, 'getUpdateId')) {
                            $updateId = $update->getUpdateId();
                        }
                        
                        $lastUpdateId = $updateId;
                        
                        // Process the update through the commands handler manually
                        Telegram::processCommand($update);
                        
                        $this->info("Processed update ID: {$lastUpdateId}");
                    }
                }
            } catch (\Exception $e) {
                $this->error("Polling error: " . $e->getMessage());
                sleep(5); // Wait before retrying on error
            }

            // Small delay to prevent CPU spinning if not using long-polling correctly
            usleep(500000); 
        }
    }
}
