"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { FUEL_TYPES, fetchStations, parseStation, computeStats, categorizePrice, getDistance } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import { useLang, LANGUAGES } from "@/lib/i18n";
import SearchBar from "@/components/SearchBar";
import PriceStats from "@/components/PriceHistory";

const StationMap = dynamic(() => import("@/components/StationMap"), { ssr: false });

export default function Home() {
  const [allRaw, setAllRaw] = useState([]);
  const [stations, setStations] = useState([]);
  const [stats, setStats] = useState(null);
  const [fuelKey, setFuelKey] = useState(FUEL_TYPES[0].key);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState({ lat: 40.4168, lng: -3.7038 });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [radius, setRadius] = useState(10);
  const [showHistory, setShowHistory] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const mapRef = useRef(null);

  const RADIUS_OPTIONS = [5, 10, 25, 50];

  useEffect(() => {
    setLoading(true);
    fetchStations()
      .then((raw) => {
        setAllRaw(raw);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch stations:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!allRaw.length) return;

    const parsed = allRaw
      .map((r) => parseStation(r, fuelKey))
      .filter(Boolean);

    const st = computeStats(parsed);

    const withCategory = parsed.map((s) => ({
      ...s,
      category: categorizePrice(s.price, st),
    }));

    if (userPos) {
      withCategory.forEach((s) => {
        s.distance = getDistance(userPos.lat, userPos.lng, s.lat, s.lng);
      });
    }

    setStations(withCategory);
    setStats(st);
  }, [allRaw, fuelKey, userPos]);

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(loc);
        if (mapRef.current) {
          mapRef.current.flyTo([loc.lat, loc.lng], 13);
        }
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    locateUser();
  }, [locateUser]);

  const sortedStations = [...stations].sort((a, b) => {
    if (userPos) return (a.distance || 999) - (b.distance || 999);
    return a.price - b.price;
  });

  const nearbyStations = userPos
    ? sortedStations.filter((s) => s.distance != null && s.distance <= radius)
    : sortedStations.slice(0, 100);

  const cheapCount = stations.filter((s) => s.category === "cheap").length;
  const midCount = stations.filter((s) => s.category === "mid").length;
  const expensiveCount = stations.filter((s) => s.category === "expensive").length;

  const handleStationClick = (station) => {
    setSelectedStation(station);
    if (mapRef.current) {
      mapRef.current.flyTo([station.lat, station.lng], 16);
    }
  };

  const handleSearchLocation = (loc) => {
    setUserPos({ lat: loc.lat, lng: loc.lng });
    if (mapRef.current) {
      if (loc.bounds) {
        mapRef.current.flyToBounds(loc.bounds, { padding: [30, 30], maxZoom: 15 });
      } else {
        mapRef.current.flyTo([loc.lat, loc.lng], 14);
      }
    }
  };

  const handleSearchStation = (station) => {
    setSelectedStation(station);
    setUserPos({ lat: station.lat, lng: station.lng });
    if (mapRef.current) {
      mapRef.current.flyTo([station.lat, station.lng], 16);
    }
  };

  const fuelLabel = FUEL_TYPES.find((f) => f.key === fuelKey)?.short || "";

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
        <div className="sidebar-header">
          <div className="header-brand">
            <img src="/logo.png" alt="GasRadar" className="header-logo-img" />
            <div className="header-title-group">
              <h1>GasRadar</h1>
              <span className="header-by">by ktr3</span>
            </div>
          </div>
          <div className="header-actions">
            <div className="lang-selector">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={`lang-btn ${lang === l.code ? "active" : ""}`}
                  onClick={() => setLang(l.code)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === "dark" ? t.lightMode : t.darkMode}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              className="sidebar-toggle-btn desktop-only"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <>
            <SearchBar
              stations={stations}
              onSelectLocation={handleSearchLocation}
              onSelectStation={handleSearchStation}
            />

            <div className="sidebar-fuel">
              <div className="fuel-selector">
                {FUEL_TYPES.map((ft) => (
                  <button
                    key={ft.key}
                    className={`fuel-btn ${fuelKey === ft.key ? "active" : ""}`}
                    onClick={() => setFuelKey(ft.key)}
                  >
                    {ft.short}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-radius">
              <span className="radius-label">{t.radius}</span>
              <div className="radius-selector">
                {RADIUS_OPTIONS.map((km) => (
                  <button
                    key={km}
                    className={`radius-btn ${radius === km ? "active" : ""}`}
                    onClick={() => setRadius(km)}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>

            {stats && (
              <div className="stats-bar">
                <span className="stat stat-cheap">
                  <span className="stat-dot green" />
                  {cheapCount} &le; {stats.p25.toFixed(3)}€
                </span>
                <span className="stat stat-mid">
                  <span className="stat-dot yellow" />
                  {midCount} {t.median}
                </span>
                <span className="stat stat-expensive">
                  <span className="stat-dot red" />
                  {expensiveCount} &ge; {stats.p75.toFixed(3)}€
                </span>
              </div>
            )}

            <button
              className={`history-toggle ${showHistory ? "active" : ""}`}
              onClick={() => setShowHistory(!showHistory)}
            >
              <span>📊</span>
              <span>{t.compareBrands}</span>
              <span className="history-arrow">{showHistory ? "▲" : "▼"}</span>
            </button>

            {showHistory && (
              <PriceStats stations={stations} fuelLabel={fuelLabel} t={t} />
            )}

            <div className="sidebar-list-header">
              <h2>
                {userPos ? t.nearYou : t.cheapest} — {fuelLabel}
              </h2>
              <span className="panel-count">{nearbyStations.length}</span>
            </div>

            <div className="sidebar-list">
              {nearbyStations.length === 0 && !loading && (
                <div className="empty-state">
                  {t.noStationsInArea.replace("{fuel}", fuelLabel)}
                </div>
              )}
              {nearbyStations.slice(0, 50).map((s, i) => (
                <div
                  key={s.id}
                  className={`station-item ${selectedStation?.id === s.id ? "station-item-active" : ""}`}
                  onClick={() => handleStationClick(s)}
                >
                  <span className={`station-rank ${i < 3 ? "rank-top" : "rank-normal"}`}>
                    {i + 1}
                  </span>
                  <div className="station-info">
                    <div className="station-name">{s.name}</div>
                    <div className="station-address">
                      {s.address}, {s.locality}
                    </div>
                  </div>
                  <div className="station-price-col">
                    <span className={`station-price ${s.category}`}>
                      {s.price.toFixed(3)}
                    </span>
                    <span className="price-unit">€/L</span>
                  </div>
                  {s.distance != null && (
                    <span className="station-distance">
                      {s.distance < 1
                        ? `${Math.round(s.distance * 1000)}m`
                        : `${s.distance.toFixed(1)}km`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {!sidebarOpen && (
        <button className="mobile-sidebar-btn" onClick={() => setSidebarOpen(true)}>
          ☰
        </button>
      )}

      <main className="map-area">
        <div className="map-container">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <div className="loading-text">{t.loading}</div>
            </div>
          )}
          <StationMap
            stations={nearbyStations}
            userPos={userPos}
            mapRef={mapRef}
            selectedStation={selectedStation}
            stats={stats}
            theme={theme}
          />
          <div className="map-controls">
            <button className="map-btn" onClick={locateUser} title={t.myLocation}>
              📍
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
