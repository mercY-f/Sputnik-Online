<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds real PostGIS usage for satellite alerts:
 *  - alert_rules.zone  — generated geography(Point,4326) from (longitude, latitude) + GIST index
 *  - satellite_subpoints — latest sub-satellite point per satellite (geography + GIST index)
 *
 * The whole migration is a no-op on non-pgsql drivers (tests run on sqlite :memory:).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS postgis');

        DB::statement(<<<'SQL'
            ALTER TABLE alert_rules
            ADD COLUMN zone geography(Point, 4326)
            GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED
        SQL);

        DB::statement('CREATE INDEX alert_rules_zone_gist ON alert_rules USING GIST (zone)');

        DB::statement(<<<'SQL'
            CREATE TABLE satellite_subpoints (
                satellite_id bigint PRIMARY KEY
                    REFERENCES satellites (id) ON DELETE CASCADE,
                position geography(Point, 4326) NOT NULL,
                alt_km real,
                computed_at timestamp(0) without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
            )
        SQL);

        DB::statement('CREATE INDEX satellite_subpoints_position_gist ON satellite_subpoints USING GIST (position)');
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        Schema::dropIfExists('satellite_subpoints');

        DB::statement('DROP INDEX IF EXISTS alert_rules_zone_gist');
        DB::statement('ALTER TABLE alert_rules DROP COLUMN IF EXISTS zone');

        // Extension is left in place: it may pre-exist and be used by other schemas.
    }
};
