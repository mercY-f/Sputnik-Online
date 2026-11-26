<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('satellites', function (Blueprint $table) {
            $table->string('country')->nullable();
            $table->string('country_name')->nullable();
            $table->date('launch_date')->nullable();
            $table->string('launch_site')->nullable();
            $table->string('purpose')->nullable();
            $table->string('object_type')->nullable();
            $table->date('decay_date')->nullable();
            $table->string('rcs_size')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('satellites', function (Blueprint $table) {
            $table->dropColumn([
                'country',
                'country_name',
                'launch_date',
                'launch_site',
                'purpose',
                'object_type',
                'decay_date',
                'rcs_size',
            ]);
        });
    }
};
