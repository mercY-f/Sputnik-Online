import assert from 'node:assert/strict';
import { computeOrbitParameters, parseIntlDesignator, expandYear, getOrbitType } from '../../resources/js/lib/orbit.js';

console.log('--- Testing orbit.js pure functions ---');

// 1. STARLINK-1454
const starlinkTle1 = '1 45671U 20035A   26299.00000000  .00000000  00000-0  00000-0 0  9999';
const starlinkTle2 = '2 45671  53.0217 352.5903 0005834 344.5861  15.5004 16.35664987354980';

const starlink = computeOrbitParameters(starlinkTle1, starlinkTle2);
assert(starlink !== null, 'STARLINK-1454 should parse successfully');
assert.equal(starlink.catalogNumber, '45671');
assert.equal(starlink.intlDesignator, '2020-035A');
assert.equal(starlink.launchYear, 2020);
assert.equal(starlink.inclination, 53.0217);
assert.equal(starlink.raan, 352.5903);
assert.equal(starlink.eccentricity, 0.0005834);
assert.equal(starlink.argPerigee, 344.5861);
assert.equal(starlink.meanMotion, 16.35664987);
assert.equal(starlink.periodMinutes, 88.04);
assert(starlink.perigeeKm > 170 && starlink.perigeeKm < 180, 'Perigee should be ~173.5 km');
assert(starlink.apogeeKm > 175 && starlink.apogeeKm < 185, 'Apogee should be ~181.2 km');
assert.equal(starlink.orbitType.code, 'LEO');
console.log('✓ STARLINK-1454 verified:', JSON.stringify(starlink, null, 2));

// 2. ISS (ZARYA)
const issTle1 = '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995';
const issTle2 = '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065';

const iss = computeOrbitParameters(issTle1, issTle2);
assert(iss !== null, 'ISS should parse successfully');
assert.equal(iss.catalogNumber, '25544');
assert.equal(iss.intlDesignator, '1998-067A');
assert.equal(iss.launchYear, 1998);
assert.equal(iss.inclination, 51.6337);
assert.equal(iss.periodMinutes, 92.96);
assert(iss.altitudeAvgKm > 415 && iss.altitudeAvgKm < 425, 'ISS average altitude should be ~419.5 km');
assert(iss.perigeeKm > 410 && iss.perigeeKm < 420, 'ISS perigee should be ~414.8 km');
assert(iss.apogeeKm > 420 && iss.apogeeKm < 430, 'ISS apogee should be ~424.2 km');
assert(iss.orbitalSpeedKmS > 7.6 && iss.orbitalSpeedKmS < 7.7, 'ISS orbital speed should be ~7.66 km/s');
assert.equal(iss.orbitType.code, 'LEO');
console.log('✓ ISS verified:', JSON.stringify(iss, null, 2));

// 3. International designators & year expansion
assert.equal(expandYear('98'), 1998);
assert.equal(expandYear('20'), 2020);
assert.equal(expandYear('57'), 1957);
assert.equal(expandYear('56'), 2056);

const d1 = parseIntlDesignator('20035Q');
assert.equal(d1.id, '2020-035Q');
assert.equal(d1.year, 2020);

// 4. Orbit types
assert.equal(getOrbitType({ altAvg: 500, ecc: 0.001, inc: 97.5 }).code, 'SSO');
assert.equal(getOrbitType({ altAvg: 20200, ecc: 0.01, inc: 55 }).code, 'MEO');
assert.equal(getOrbitType({ altAvg: 35786, ecc: 0.001, inc: 0.05 }).code, 'GEO');
assert.equal(getOrbitType({ altAvg: 25000, ecc: 0.72, inc: 63.4 }).code, 'HEO');

// 5. Invalid input resilience
assert.equal(computeOrbitParameters('', ''), null);
assert.equal(computeOrbitParameters(null, null), null);
assert.equal(computeOrbitParameters('broken', 'broken'), null);

console.log('All orbit tests passed successfully!');
