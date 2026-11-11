#!/usr/bin/env node
/**
 * satellite_position.cjs
 * Usage:
 *   Single: node satellite_position.cjs "<TLE_LINE1>" "<TLE_LINE2>" [unix_timestamp_seconds]
 *   Batch:  node satellite_position.cjs --batch < stdin_json
 * Outputs JSON: {"lat": float, "lng": float, "alt_km": float} or {"error": "..."}
 */

const fs = require('fs');
const satellite = require('satellite.js');

function propagateTle(tle1, tle2, tsMs) {
    try {
        const satrec = satellite.twoline2satrec(tle1, tle2);
        const date = new Date(tsMs);
        const posVel = satellite.propagate(satrec, date);

        if (!posVel.position || posVel.position === false) {
            return { error: 'Propagation failed (decayed satellite?)' };
        }

        const gmst = satellite.gstime(date);
        const geo = satellite.eciToGeodetic(posVel.position, gmst);

        const lat = satellite.degreesLat(geo.latitude);
        const lng = satellite.degreesLong(geo.longitude);
        const altKm = geo.height; // km

        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(altKm)) {
            return { error: 'Invalid coordinates computed (NaN or infinite)' };
        }

        return {
            lat: Math.round(lat * 10000) / 10000,
            lng: Math.round(lng * 10000) / 10000,
            alt_km: Math.round(altKm * 10) / 10,
        };
    } catch (e) {
        return { error: e.message };
    }
}

if (process.argv[2] === '--batch') {
    let items;
    try {
        const input = fs.readFileSync(0, 'utf-8');
        items = JSON.parse(input);
        if (!Array.isArray(items)) {
            console.log(JSON.stringify({ error: 'Input must be a JSON array' }));
            process.exit(1);
        }
    } catch (e) {
        console.log(JSON.stringify({ error: e.message }));
        process.exit(1);
    }

    console.log(JSON.stringify(items.map(it => propagateTle(it.tle1, it.tle2, it.ts ? it.ts * 1000 : Date.now()))));
} else {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log(JSON.stringify({ error: 'Usage: node satellite_position.js <TLE1> <TLE2>' }));
        process.exit(1);
    }

    const tle1 = args[0];
    const tle2 = args[1];
    const ts = args.length >= 3 && args[2] ? parseInt(args[2], 10) * 1000 : Date.now();

    const result = propagateTle(tle1, tle2, ts);
    console.log(JSON.stringify(result));
    if (result.error) {
        process.exit(1);
    }
}
