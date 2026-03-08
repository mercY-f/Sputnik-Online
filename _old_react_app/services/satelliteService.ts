import * as satellite from 'satellite.js';

export interface SatelliteData {
  name: string;
  tle1: string;
  tle2: string;
  satrec: satellite.SatRec;
}

export async function fetchSatellites(): Promise<SatelliteData[]> {
  try {
    // Fetch active satellites from CelesTrak
    // We use a CORS proxy just in case, though CelesTrak usually allows CORS
    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
    if (!response.ok) throw new Error('Failed to fetch TLE data');
    const text = await response.text();
    
    // Parse and limit to 3000 for performance reasons in the browser
    return parseTLE(text).slice(0, 3000);
  } catch (error) {
    console.error('Error fetching satellites:', error);
    return [];
  }
}

function parseTLE(tleData: string): SatelliteData[] {
  const lines = tleData.split('\n').map(line => line.trim());
  const satellites: SatelliteData[] = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 < lines.length) {
      const name = lines[i];
      const tle1 = lines[i + 1];
      const tle2 = lines[i + 2];
      
      if (tle1 && tle2 && tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
        try {
          const satrec = satellite.twoline2satrec(tle1, tle2);
          satellites.push({ name, tle1, tle2, satrec });
        } catch (e) {
          // Ignore invalid TLEs
        }
      }
    }
  }
  return satellites;
}

export function getSatellitePosition(satrec: satellite.SatRec, date: Date) {
  const positionAndVelocity = satellite.propagate(satrec, date);
  const positionEci = positionAndVelocity.position;

  if (typeof positionEci !== 'boolean' && positionEci) {
    const gmst = satellite.gstime(date);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);

    const longitude = satellite.degreesLong(positionGd.longitude);
    const latitude = satellite.degreesLat(positionGd.latitude);
    const altitude = positionGd.height; // in km

    // Normalize altitude relative to Earth radius (approx 6371 km)
    // react-globe.gl expects altitude as a fraction of globe radius
    return { lat: latitude, lng: longitude, alt: altitude / 6371 }; 
  }
  return null;
}
