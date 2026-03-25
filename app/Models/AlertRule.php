<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AlertRule extends Model
{
    protected $fillable = [
        'user_id',
        'satellite_id',
        'latitude',
        'longitude',
        'radius_km',
        'is_active',
        'last_notified_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'latitude' => 'float',
        'longitude' => 'float',
        'radius_km' => 'integer',
        'last_notified_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function satellite()
    {
        return $this->belongsTo(Satellite::class);
    }
}
