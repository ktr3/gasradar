"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { FUEL_TYPES, fetchStations, parseStation, computeStats, categorizePrice, getDistance } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import { useLang, LANGUAGES } from "@/lib/i18n";
import SearchBar from "@/components/SearchBar";
import PriceStats from "@/components/PriceHistory";

const StationMap = dynamic(() => import("@/components/StationMap"), { ssr: false });

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

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
  const [sheetPos, setSheetPos] = useState("peek"); // peek | half | full
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const mapRef = useRef(null);
  const isMobile = useIsMobile();
  const sheetRef = useRef(null);
  const dragRef = useRef({ startY: 0, startTop: 0, dragging: false });

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

  // Bottom sheet touch handling
  const handleSheetTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    dragRef.current = { startY: touch.clientY, startPos: sheetPos, dragging: true };
  }, [sheetPos]);

  const handleSheetTouchEnd = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const dy = e.changedTouches[0].clientY - dragRef.current.startY;
    const startPos = dragRef.current.startPos;
    dragRef.current.dragging = false;

    if (Math.abs(dy) < 30) return; // too small

    if (dy < 0) {
      // swipe up
      if (startPos === "peek") setSheetPos("half");
      else if (startPos === "half") setSheetPos("full");
    } else {
      // swipe down
      if (startPos === "full") setSheetPos("half");
      else if (startPos === "half") setSheetPos("peek");
    }
  }, [sheetPos]);

  const handleStationClickMobile = (station) => {
    handleStationClick(station);
    setSheetPos("peek");
  };

  // Shared content components
  const renderControls = () => (
    <>
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
    </>
  );

  const renderStats = () => stats && (
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
  );

  const renderStationList = (onItemClick) => (
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
          onClick={() => onItemClick(s)}
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
  );

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <div className="app app-mobile">
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
          </div>
        </main>

        {/* Floating top bar with search */}
        <div className="mobile-top-bar">
          <SearchBar
            stations={stations}
            onSelectLocation={handleSearchLocation}
            onSelectStation={handleSearchStation}
          />
        </div>

        {/* Floating map controls */}
        <div className="map-controls mobile-map-controls">
          <button className="map-btn" onClick={locateUser} title={t.myLocation}>
            📍
          </button>
          <button className="map-btn" onClick={toggleTheme} title={theme === "dark" ? t.lightMode : t.darkMode}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {/* Bottom sheet */}
        <div
          ref={sheetRef}
          className={`bottom-sheet sheet-${sheetPos}`}
        >
          <div
            className="sheet-handle-area"
            onTouchStart={handleSheetTouchStart}
            onTouchEnd={handleSheetTouchEnd}
            onClick={() => setSheetPos(sheetPos === "peek" ? "half" : sheetPos === "half" ? "full" : "half")}
          >
            <div className="sheet-handle" />
            <div className="sheet-peek-info">
              <span className="sheet-title">{t.nearYou} — {fuelLabel}</span>
              <span className="panel-count">{nearbyStations.length}</span>
            </div>
          </div>

          <div className="sheet-content">
            {renderControls()}
            {renderStats()}

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
              <h2>{userPos ? t.nearYou : t.cheapest} — {fuelLabel}</h2>
              <div className="sheet-header-actions">
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
              </div>
            </div>

            {renderStationList(handleStationClickMobile)}
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop layout ──
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
            {renderControls()}
            {renderStats()}

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

            {renderStationList(handleStationClick)}
          </>
        )}
      </aside>

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
