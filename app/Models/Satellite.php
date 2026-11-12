<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

use App\Traits\Trackable;
use App\Interfaces\CacheableInterface;
use App\Support\SatelliteCache;

class Satellite extends Model implements CacheableInterface
{
    use Trackable;

    protected $fillable = [
        'name',
        'catalog_number',
        'category',
        'tle1',
        'tle2',
        'country',
        'country_name',
        'launch_date',
        'launch_site',
        'purpose',
        'object_type',
        'decay_date',
        'rcs_size',
    ];

    protected $casts = [
        'launch_date' => 'date:Y-m-d',
        'decay_date' => 'date:Y-m-d',
    ];

    public function satelliteCategory()
    {
        return $this->belongsTo(SatelliteCategory::class , 'category', 'name');
    }

    public function favoritedBy()
    {
        return $this->belongsToMany(User::class , 'user_satellite');
    }

    public function getCacheKey(): string
    {
        return SatelliteCache::satelliteKey($this->id);
    }

    public function getCacheTtl(): int
    {
        return 3600; // 1 hour
    }

    public function clearCache(): void
    {
        SatelliteCache::forgetSatellite($this->id);
        SatelliteCache::forgetCatalog();
    }

    public function alertRules()
    {
        return $this->hasMany(AlertRule::class);
    }
}
