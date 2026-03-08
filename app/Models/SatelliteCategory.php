<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SatelliteCategory extends Model
{
    protected $fillable = ['name', 'description'];

    public function satellites()
    {
        return $this->hasMany(Satellite::class , 'category', 'name');
    }
}
