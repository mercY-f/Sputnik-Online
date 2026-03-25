#!/usr/bin/env node
/**
 * satellite_position.js
 * Usage: node satellite_position.js "<TLE_LINE1>" "<TLE_LINE2>"
 * Outputs JSON: {"lat": float, "lng": float, "alt_km": float} or {"error": "..."}
 */

const satellite = require('satellite.js');

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log(JSON.stringify({ error: 'Usage: node satellite_position.js <TLE1> <TLE2>' }));
    process.exit(1);
}

const tle1 = args[0];
const tle2 = args[1];

try {
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const now = new Date();
    const posVel = satellite.propagate(satrec, now);

    if (!posVel.position || posVel.position === false) {
        console.log(JSON.stringify({ error: 'Propagation failed (decayed satellite?)' }));
        process.exit(1);
    }

    const gmst = satellite.gstime(now);
    const geo  = satellite.eciToGeodetic(posVel.position, gmst);

    const lat    = satellite.degreesLat(geo.latitude);
    const lng    = satellite.degreesLong(geo.longitude);
    const altKm  = geo.height; // km

    console.log(JSON.stringify({
        lat:    Math.round(lat * 10000) / 10000,
        lng:    Math.round(lng * 10000) / 10000,
        alt_km: Math.round(altKm * 10) / 10,
    }));
} catch (e) {
    console.log(JSON.stringify({ error: e.message }));
    process.exit(1);
}
