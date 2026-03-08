<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('satellites', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('catalog_number')->unique();
            $table->string('category')->default('OTHER');
            $table->text('tle1');
            $table->text('tle2');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('satellites');
    }
};
