<?php

namespace App\Traits;

use App\Models\User;
use Illuminate\Support\Facades\Schema;

trait Trackable
{
    /**
     * Boot the trackable trait to automatically set
     * created_by and updated_by if those columns exist on the model.
     * Note: for this to work out of the box, add created_by and updated_by to your migrations.
     */
    public static function bootTrackable()
    {
        static::creating(function ($model) {
            if (auth()->check() && Schema::hasColumn($model->getTable(), 'created_by')) {
                $model->created_by = auth()->id();
            }
        });

        static::updating(function ($model) {
            if (auth()->check() && Schema::hasColumn($model->getTable(), 'updated_by')) {
                $model->updated_by = auth()->id();
            }
        });
    }

    /**
     * Get the user that created the model.
     */
    public function creator()
    {
        return $this->belongsTo(User::class , 'created_by');
    }

    /**
     * Get the user that updated the model.
     */
    public function updater()
    {
        return $this->belongsTo(User::class , 'updated_by');
    }
}
