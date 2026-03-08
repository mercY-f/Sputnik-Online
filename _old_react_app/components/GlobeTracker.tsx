import React, { useEffect, useState, useRef, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { Menu, ChevronLeft } from 'lucide-react';
import { fetchSatellites, getSatellitePosition, SatelliteData } from '../services/satelliteService';

interface SatObject {
  name: string;
  lat: number;
  lng: number;
  alt: number;
}

const CATEGORIES: Record<string, (name: string) => boolean> = {
  'ALL': () => true,
  'ISS': (name) => name.includes('ISS') || name.includes('ZARYA'),
  'STARLINK': (name) => name.includes('STARLINK'),
  'ONEWEB': (name) => name.includes('ONEWEB'),
  'IRIDIUM': (name) => name.includes('IRIDIUM'),
  'NAVIGATION': (name) => name.includes('NAVSTAR') || name.includes('GLONASS') || name.includes('GALILEO') || name.includes('BEIDOU'),
  'WEATHER': (name) => name.includes('NOAA') || name.includes('GOES') || name.includes('METEOR'),
};

const SAT_GEOMETRY = new THREE.SphereGeometry(0.08, 8, 8);
const ISS_GEOMETRY = new THREE.SphereGeometry(0.2, 16, 16);

const MATERIALS: Record<string, THREE.MeshBasicMaterial> = {
  'ISS': new THREE.MeshBasicMaterial({ color: '#ef4444' }), // red-500
  'STARLINK': new THREE.MeshBasicMaterial({ color: '#3b82f6' }), // blue-500
  'ONEWEB': new THREE.MeshBasicMaterial({ color: '#8b5cf6' }), // violet-500
  'IRIDIUM': new THREE.MeshBasicMaterial({ color: '#f59e0b' }), // amber-500
  'NAVIGATION': new THREE.MeshBasicMaterial({ color: '#eab308' }), // yellow-500
  'WEATHER': new THREE.MeshBasicMaterial({ color: '#06b6d4' }), // cyan-500
  'DEFAULT': new THREE.MeshBasicMaterial({ color: '#10b981' }), // emerald-500
};

const getSatColorHex = (name: string) => {
  if (CATEGORIES['ISS'](name)) return '#ef4444';
  if (CATEGORIES['STARLINK'](name)) return '#3b82f6';
  if (CATEGORIES['ONEWEB'](name)) return '#8b5cf6';
  if (CATEGORIES['IRIDIUM'](name)) return '#f59e0b';
  if (CATEGORIES['NAVIGATION'](name)) return '#eab308';
  if (CATEGORIES['WEATHER'](name)) return '#06b6d4';
  return '#10b981';
};

const getSatMaterial = (name: string) => {
  if (CATEGORIES['ISS'](name)) return MATERIALS['ISS'];
  if (CATEGORIES['STARLINK'](name)) return MATERIALS['STARLINK'];
  if (CATEGORIES['ONEWEB'](name)) return MATERIALS['ONEWEB'];
  if (CATEGORIES['IRIDIUM'](name)) return MATERIALS['IRIDIUM'];
  if (CATEGORIES['NAVIGATION'](name)) return MATERIALS['NAVIGATION'];
  if (CATEGORIES['WEATHER'](name)) return MATERIALS['WEATHER'];
  return MATERIALS['DEFAULT'];
};

export default function GlobeTracker() {
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [satPositions, setSatPositions] = useState<SatObject[]>([]);
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const globeRef = useRef<any>();
  
  // Keep references to the same objects to prevent React-Globe from recreating them
  // This stops the blinking and allows tooltips to stay open
  const activeSatsRef = useRef<{ sat: SatelliteData, obj: SatObject }[]>([]);

  useEffect(() => {
    fetchSatellites().then(data => {
      setSatellites(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (satellites.length === 0) return;

    const activeSats = satellites.filter(sat => CATEGORIES[filter](sat.name));
    
    // Initialize the objects for the current filter
    activeSatsRef.current = activeSats.map(sat => ({
      sat,
      obj: { name: sat.name, lat: 0, lng: 0, alt: 0 }
    }));

    const updatePositions = () => {
      const now = new Date();
      setTime(now);
      
      let updated = false;
      for (const item of activeSatsRef.current) {
        const pos = getSatellitePosition(item.sat.satrec, now);
        if (pos) {
          item.obj.lat = pos.lat;
          item.obj.lng = pos.lng;
          item.obj.alt = pos.alt;
          updated = true;
        }
      }
      
      if (updated) {
        // Create a new array but keep the same object references
        setSatPositions([...activeSatsRef.current.map(item => item.obj)]);
      }
    };

    // Update positions every second
    const interval = setInterval(updatePositions, 1000);
    updatePositions();

    return () => clearInterval(interval);
  }, [satellites, filter]);

  useEffect(() => {
    if (globeRef.current && !loading) {
      // Disable auto-rotation safely
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = false;
      }
      
      // Set initial camera position
      globeRef.current.pointOfView({ altitude: 2.5 });
    }
  }, [loading]);

  const focusSatellite = (sat: SatObject) => {
    if (globeRef.current) {
      globeRef.current.pointOfView({
        lat: sat.lat,
        lng: sat.lng,
        altitude: sat.alt + 0.8
      }, 1000);
    }
  };

  return (
    <div className="w-full h-screen bg-[#050505] relative overflow-hidden font-sans">
      {/* Floating Menu Button */}
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className={`absolute top-6 left-6 z-20 p-3 bg-black/40 border border-white/10 rounded-xl text-white backdrop-blur-md transition-all duration-300 hover:bg-white/10 cursor-pointer ${isSidebarOpen ? 'opacity-0 pointer-events-none -translate-x-10' : 'opacity-100 translate-x-0'}`}
        title="Open Panel"
      >
        <Menu size={24} />
      </button>

      {/* Sidebar Panel */}
      <div className={`absolute top-6 left-6 bottom-6 z-30 text-white bg-black/40 p-6 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl w-80 flex flex-col pointer-events-none transition-transform duration-500 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[150%]'}`}>
        <div className="flex justify-between items-center mb-2 shrink-0 pointer-events-auto">
          <h1 className="text-2xl font-bold tracking-tight">Earth Orbit Live</h1>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-gray-400 hover:text-white"
            title="Close Panel"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center space-x-3 text-emerald-400 mt-4 shrink-0">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Acquiring satellite telemetry...</p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col h-full overflow-hidden">
            <div className="space-y-2 shrink-0">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-sm text-gray-400">Tracked Objects</span>
                <span className="text-emerald-400 font-mono font-bold">{satPositions.length.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm text-gray-400">System Time</span>
                <span className="text-xs text-gray-300 font-mono">{time.toISOString().split('T')[1].split('.')[0]} UTC</span>
              </div>
            </div>
            
            <div className="pt-4 shrink-0 pointer-events-auto">
              <span className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Filter Constellation</span>
              <div className="flex flex-wrap gap-2">
                {Object.keys(CATEGORIES).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer ${
                      filter === f 
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-white/10 flex-1 overflow-hidden flex flex-col pointer-events-auto">
              <span className="text-xs text-gray-500 uppercase tracking-wider mb-2 block shrink-0">
                Satellite List {satPositions.length > 100 ? '(Top 100)' : ''}
              </span>
              <div className="overflow-y-auto flex-1 space-y-1 pr-2 pb-2 custom-scrollbar">
                {satPositions.slice(0, 100).map(sat => (
                  <button
                    key={sat.name}
                    onClick={() => focusSatellite(sat)}
                    className="w-full text-left px-3 py-2 text-xs rounded bg-white/5 hover:bg-white/10 transition-colors text-gray-300 truncate flex items-center cursor-pointer"
                  >
                    <span className="inline-block w-2 h-2 rounded-full mr-3 shrink-0" style={{ backgroundColor: getSatColorHex(sat.name) }}></span>
                    <span className="truncate">{sat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        objectsData={satPositions}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="alt"
        objectThreeObject={(d: any) => {
          const isISS = CATEGORIES['ISS'](d.name);
          return new THREE.Mesh(
            isISS ? ISS_GEOMETRY : SAT_GEOMETRY,
            getSatMaterial(d.name)
          );
        }}
        objectLabel={(d: any) => `
          <div class="bg-black/80 text-white p-3 rounded-lg border border-white/20 text-xs font-mono backdrop-blur-md shadow-xl">
            <div class="font-bold mb-2 text-sm border-b border-white/10 pb-1" style="color: ${getSatColorHex(d.name)}">${d.name}</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1">
              <span class="text-gray-400">ALT:</span> <span class="text-right">${(d.alt * 6371).toFixed(1)} km</span>
              <span class="text-gray-400">LAT:</span> <span class="text-right">${d.lat.toFixed(4)}°</span>
              <span class="text-gray-400">LNG:</span> <span class="text-right">${d.lng.toFixed(4)}°</span>
            </div>
          </div>
        `}
      />
    </div>
  );
}
