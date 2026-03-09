"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { FUEL_TYPES, fetchStations, parseStation, computeStats, categorizePrice, getDistance, extractBrands } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import { useLang, LANGUAGES } from "@/lib/i18n";
import { useFavorites } from "@/lib/useFavorites";
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

const RADIUS_OPTIONS = [5, 10, 25, 50];
const TANK_OPTIONS = [20, 40, 60, 80];

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
  const [sheetPos, setSheetPos] = useState("peek");
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [tankSize, setTankSize] = useState(40);
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { favoriteIds, toggleFavorite, isFavorite, getPriceChange, updatePrices } = useFavorites();
  const mapRef = useRef(null);
  const isMobile = useIsMobile();
  const sheetRef = useRef(null);
  const dragRef = useRef({ startY: 0, startPos: "peek", dragging: false, lastY: 0, lastTime: 0, velocity: 0 });

  useEffect(() => {
    setLoading(true);
    fetchStations()
      .then((raw) => { setAllRaw(raw); setLoading(false); })
      .catch((err) => { console.error("Failed to fetch stations:", err); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!allRaw.length) return;
    const parsed = allRaw.map((r) => parseStation(r, fuelKey)).filter(Boolean);
    const st = computeStats(parsed);
    const withCategory = parsed.map((s) => ({ ...s, category: categorizePrice(s.price, st) }));
    if (userPos) {
      withCategory.forEach((s) => { s.distance = getDistance(userPos.lat, userPos.lng, s.lat, s.lng); });
    }
    setStations(withCategory);
    setStats(st);
  }, [allRaw, fuelKey, userPos]);

  // Update favorite prices when stations change
  useEffect(() => {
    if (stations.length && favoriteIds.size) updatePrices(stations, fuelKey);
  }, [stations, fuelKey, favoriteIds.size, updatePrices]);

  const availableBrands = useMemo(() => extractBrands(stations), [stations]);

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(loc);
        if (mapRef.current) mapRef.current.flyTo([loc.lat, loc.lng], 13);
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => { locateUser(); }, [locateUser]);

  const sortedStations = useMemo(() => {
    let list = [...stations];
    // Brand filter
    if (selectedBrands.length > 0) {
      const brandSet = new Set(selectedBrands);
      list = list.filter((s) => brandSet.has(s.brand.toUpperCase().trim()));
    }
    // Favorites filter
    if (showFavoritesOnly) {
      list = list.filter((s) => favoriteIds.has(s.id));
    }
    list.sort((a, b) => {
      if (userPos) return (a.distance || 999) - (b.distance || 999);
      return a.price - b.price;
    });
    return list;
  }, [stations, selectedBrands, showFavoritesOnly, favoriteIds, userPos]);

  const nearbyStations = useMemo(() => {
    return userPos
      ? sortedStations.filter((s) => s.distance != null && s.distance <= radius)
      : sortedStations.slice(0, 100);
  }, [sortedStations, userPos, radius]);

  // Savings calculation
  const cheapestPrice = nearbyStations.length > 0 ? Math.min(...nearbyStations.map((s) => s.price)) : 0;
  const mostExpensivePrice = nearbyStations.length > 0 ? Math.max(...nearbyStations.map((s) => s.price)) : 0;

  const cheapCount = stations.filter((s) => s.category === "cheap").length;
  const midCount = stations.filter((s) => s.category === "mid").length;
  const expensiveCount = stations.filter((s) => s.category === "expensive").length;

  const handleStationClick = (station) => {
    setSelectedStation(station);
    if (mapRef.current) mapRef.current.flyTo([station.lat, station.lng], 16);
  };

  const handleSearchLocation = (loc) => {
    setUserPos({ lat: loc.lat, lng: loc.lng });
    if (mapRef.current) {
      if (loc.bounds) mapRef.current.flyToBounds(loc.bounds, { padding: [30, 30], maxZoom: 15 });
      else mapRef.current.flyTo([loc.lat, loc.lng], 14);
    }
  };

  const handleSearchStation = (station) => {
    setSelectedStation(station);
    setUserPos({ lat: station.lat, lng: station.lng });
    if (mapRef.current) mapRef.current.flyTo([station.lat, station.lng], 16);
  };

  const fuelLabel = FUEL_TYPES.find((f) => f.key === fuelKey)?.short || "";

  // Bottom sheet touch handling with velocity
  const handleSheetTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    dragRef.current = { startY: touch.clientY, startPos: sheetPos, dragging: true, lastY: touch.clientY, lastTime: Date.now(), velocity: 0 };
  }, [sheetPos]);

  const handleSheetTouchMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const touch = e.touches[0];
    const now = Date.now();
    const dt = now - dragRef.current.lastTime;
    if (dt > 0) {
      dragRef.current.velocity = (touch.clientY - dragRef.current.lastY) / dt;
    }
    dragRef.current.lastY = touch.clientY;
    dragRef.current.lastTime = now;
  }, []);

  const handleSheetTouchEnd = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const dy = e.changedTouches[0].clientY - dragRef.current.startY;
    const startPos = dragRef.current.startPos;
    const velocity = dragRef.current.velocity;
    dragRef.current.dragging = false;

    const isFastFlick = Math.abs(velocity) > 0.5;
    const threshold = isFastFlick ? 10 : 40;

    if (Math.abs(dy) < threshold && !isFastFlick) return;

    if (dy < -threshold || (isFastFlick && velocity < 0)) {
      if (startPos === "peek") setSheetPos("half");
      else if (startPos === "half") setSheetPos("full");
    } else if (dy > threshold || (isFastFlick && velocity > 0)) {
      if (startPos === "full") setSheetPos("half");
      else if (startPos === "half") setSheetPos("peek");
    }
  }, []);

  const handleStationClickMobile = (station) => {
    handleStationClick(station);
    setSheetPos("peek");
  };

  const toggleBrand = (brand) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  // Shared content components
  const renderControls = () => (
    <>
      <div className="sidebar-fuel">
        <div className="fuel-selector">
          {FUEL_TYPES.map((ft) => (
            <button key={ft.key} className={`fuel-btn ${fuelKey === ft.key ? "active" : ""}`} onClick={() => setFuelKey(ft.key)}>
              {ft.short}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-radius">
        <span className="radius-label">{t.radius}</span>
        <div className="radius-selector">
          {RADIUS_OPTIONS.map((km) => (
            <button key={km} className={`radius-btn ${radius === km ? "active" : ""}`} onClick={() => setRadius(km)}>
              {km} km
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-radius">
        <span className="radius-label">{t.tankSize}</span>
        <div className="radius-selector">
          {TANK_OPTIONS.map((l) => (
            <button key={l} className={`radius-btn ${tankSize === l ? "active" : ""}`} onClick={() => setTankSize(l)}>
              {l}{t.liters}
            </button>
          ))}
        </div>
      </div>

      {availableBrands.length > 0 && (
        <div className="sidebar-brand-filter">
          <span className="radius-label">{t.filterByBrand}</span>
          <div className="brand-chips">
            <button className={`brand-chip ${selectedBrands.length === 0 ? "active" : ""}`} onClick={() => setSelectedBrands([])}>
              {t.allBrands}
            </button>
            {availableBrands.slice(0, 20).map((b) => (
              <button
                key={b.brand}
                className={`brand-chip ${selectedBrands.includes(b.brand) ? "active" : ""}`}
                onClick={() => toggleBrand(b.brand)}
              >
                {b.brand}
              </button>
            ))}
          </div>
        </div>
      )}
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
      {nearbyStations.slice(0, 50).map((s, i) => {
        const priceChange = isFavorite(s.id) ? getPriceChange(s.id, fuelKey, s.price) : null;
        const savingsVsExpensive = (mostExpensivePrice - s.price) * tankSize;
        const costVsCheapest = (s.price - cheapestPrice) * tankSize;

        return (
          <div
            key={s.id}
            className={`station-item ${selectedStation?.id === s.id ? "station-item-active" : ""}`}
            onClick={() => onItemClick(s)}
          >
            <span className={`station-rank ${i < 3 ? "rank-top" : "rank-normal"}`}>
              {i + 1}
            </span>
            <div className="station-info">
              <div className="station-name-row">
                <span className="station-name">{s.name}</span>
                <button
                  className={`fav-btn ${isFavorite(s.id) ? "fav-active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id, fuelKey, s.price); }}
                  aria-label={isFavorite(s.id) ? "Remove favorite" : "Add favorite"}
                >
                  {isFavorite(s.id) ? "★" : "☆"}
                </button>
              </div>
              <div className="station-address">
                {s.address}, {s.locality}
              </div>
              {nearbyStations.length > 1 && (
                <div className="station-savings">
                  {s.price <= cheapestPrice + 0.001 ? (
                    <span className="savings-cheap">{t.youSave} {savingsVsExpensive.toFixed(2)}€ {t.vsExpensive}</span>
                  ) : costVsCheapest > 0.01 ? (
                    <span className="savings-expensive">+{costVsCheapest.toFixed(2)}€ {t.moreThanCheapest}</span>
                  ) : null}
                </div>
              )}
            </div>
            <div className="station-price-col">
              <span className={`station-price ${s.category}`}>
                {s.price.toFixed(3)}
              </span>
              <span className="price-unit">€/L</span>
              {priceChange && (
                <span className={`price-change ${priceChange.direction === "up" ? "price-up" : "price-down"}`}>
                  {priceChange.direction === "up" ? "▲" : "▼"} {priceChange.amount.toFixed(3)}
                </span>
              )}
            </div>
            {s.distance != null && (
              <span className="station-distance">
                {s.distance < 1
                  ? `${Math.round(s.distance * 1000)}m`
                  : `${s.distance.toFixed(1)}km`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderListHeader = (extraActions) => (
    <div className="sidebar-list-header">
      <h2>{userPos ? t.nearYou : t.cheapest} — {fuelLabel}</h2>
      <div className="list-header-actions">
        <button
          className={`fav-filter-btn ${showFavoritesOnly ? "active" : ""}`}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          title={showFavoritesOnly ? t.showAll : t.showFavorites}
        >
          {showFavoritesOnly ? "★" : "☆"} {favoriteIds.size > 0 && <span className="fav-count">{favoriteIds.size}</span>}
        </button>
        <span className="panel-count">{nearbyStations.length}</span>
        {extraActions}
      </div>
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
              favoriteIds={favoriteIds}
              cheapestPrice={cheapestPrice}
              mostExpensivePrice={mostExpensivePrice}
              tankSize={tankSize}
            />
          </div>
        </main>

        <div className="mobile-top-bar">
          <SearchBar stations={stations} onSelectLocation={handleSearchLocation} onSelectStation={handleSearchStation} />
        </div>

        <div className="map-controls mobile-map-controls">
          <button className="map-btn" onClick={locateUser} title={t.myLocation}>📍</button>
          <button className="map-btn" onClick={toggleTheme} title={theme === "dark" ? t.lightMode : t.darkMode}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        <div ref={sheetRef} className={`bottom-sheet sheet-${sheetPos}`}>
          <div
            className="sheet-handle-area"
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            onClick={() => setSheetPos(sheetPos === "peek" ? "half" : sheetPos === "half" ? "full" : "half")}
          >
            <div className="sheet-handle" />
            <div className="sheet-peek-info">
              <span className="sheet-title">{t.nearYou} — {fuelLabel}</span>
              {nearbyStations.length > 0 && (
                <span className="sheet-cheapest">
                  {t.cheapest}: {cheapestPrice.toFixed(3)}€/L
                </span>
              )}
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

            {showHistory && <PriceStats stations={stations} fuelLabel={fuelLabel} t={t} />}

            {renderListHeader(
              <div className="lang-selector">
                {LANGUAGES.map((l) => (
                  <button key={l.code} className={`lang-btn ${lang === l.code ? "active" : ""}`} onClick={() => setLang(l.code)}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}

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
                <button key={l.code} className={`lang-btn ${lang === l.code ? "active" : ""}`} onClick={() => setLang(l.code)}>
                  {l.label}
                </button>
              ))}
            </div>
            <button className="theme-toggle" onClick={toggleTheme} title={theme === "dark" ? t.lightMode : t.darkMode}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="sidebar-toggle-btn desktop-only" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? "◀" : "▶"}
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <>
            <SearchBar stations={stations} onSelectLocation={handleSearchLocation} onSelectStation={handleSearchStation} />
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

            {showHistory && <PriceStats stations={stations} fuelLabel={fuelLabel} t={t} />}

            {renderListHeader()}
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
            favoriteIds={favoriteIds}
            cheapestPrice={cheapestPrice}
            mostExpensivePrice={mostExpensivePrice}
            tankSize={tankSize}
          />
          <div className="map-controls">
            <button className="map-btn" onClick={locateUser} title={t.myLocation}>📍</button>
          </div>
        </div>
      </main>
    </div>
  );
}
