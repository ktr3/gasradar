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
    const check = () => {
      const isNarrow = window.innerWidth <= 768;
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      setMobile(isNarrow || (isTouch && window.innerWidth <= 1024));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

const RADIUS_OPTIONS = [5, 10, 25, 50];
const TANK_OPTIONS = [20, 40, 60, 80];
const MAP_MODES = [
  { key: "schema", icon: "🗺️" },
  { key: "satellite", icon: "🛰️" },
];

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
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [tankSize, setTankSize] = useState(40);
  const [mapMode, setMapMode] = useState("schema");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { favoriteIds, toggleFavorite, isFavorite, getPriceChange, updatePrices } = useFavorites();
  const mapRef = useRef(null);
  const isMobile = useIsMobile();
  const cardsRef = useRef(null);

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
    if (selectedBrands.length > 0) {
      const brandSet = new Set(selectedBrands);
      list = list.filter((s) => brandSet.has(s.brand.toUpperCase().trim()));
    }
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

  const toggleBrand = (brand) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  // Mobile: scroll to card when station is selected
  const handleMobileCardClick = (station, index) => {
    handleStationClick(station);
    if (cardsRef.current) {
      const card = cardsRef.current.children[index];
      if (card) card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
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
        {/* Fullscreen map */}
        <div className="mobile-map-fullscreen">
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
            mapMode={mapMode}
            favoriteIds={favoriteIds}
            cheapestPrice={cheapestPrice}
            mostExpensivePrice={mostExpensivePrice}
            tankSize={tankSize}
          />
        </div>

        {/* Floating search bar */}
        <div className="m-search-bar">
          <SearchBar stations={stations} onSelectLocation={handleSearchLocation} onSelectStation={handleSearchStation} />
        </div>

        {/* Floating fuel pills */}
        <div className="m-fuel-pills">
          {FUEL_TYPES.map((ft) => (
            <button key={ft.key} className={`m-pill ${fuelKey === ft.key ? "active" : ""}`} onClick={() => setFuelKey(ft.key)}>
              {ft.short}
            </button>
          ))}
          <button className={`m-pill m-pill-icon ${mobileFiltersOpen ? "active" : ""}`} onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}>
            ⚙️
          </button>
        </div>

        {/* Floating filters panel */}
        {mobileFiltersOpen && (
          <div className="m-filters-panel">
            <div className="m-filters-row">
              <span className="m-filters-label">{t.radius}</span>
              <div className="m-filters-options">
                {RADIUS_OPTIONS.map((km) => (
                  <button key={km} className={`m-pill-sm ${radius === km ? "active" : ""}`} onClick={() => setRadius(km)}>
                    {km}km
                  </button>
                ))}
              </div>
            </div>
            <div className="m-filters-row">
              <span className="m-filters-label">{t.tankSize}</span>
              <div className="m-filters-options">
                {TANK_OPTIONS.map((l) => (
                  <button key={l} className={`m-pill-sm ${tankSize === l ? "active" : ""}`} onClick={() => setTankSize(l)}>
                    {l}{t.liters}
                  </button>
                ))}
              </div>
            </div>
            {availableBrands.length > 0 && (
              <div className="m-filters-row">
                <span className="m-filters-label">{t.filterByBrand}</span>
                <div className="m-filters-brands">
                  <button className={`m-pill-sm ${selectedBrands.length === 0 ? "active" : ""}`} onClick={() => setSelectedBrands([])}>
                    {t.allBrands}
                  </button>
                  {availableBrands.slice(0, 15).map((b) => (
                    <button
                      key={b.brand}
                      className={`m-pill-sm ${selectedBrands.includes(b.brand) ? "active" : ""}`}
                      onClick={() => toggleBrand(b.brand)}
                    >
                      {b.brand}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="m-filters-row">
              <span className="m-filters-label">{t.lang}</span>
              <div className="m-filters-options">
                {LANGUAGES.map((l) => (
                  <button key={l.code} className={`m-pill-sm ${lang === l.code ? "active" : ""}`} onClick={() => setLang(l.code)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="m-filters-row">
              <button
                className={`m-pill-sm fav-toggle ${showFavoritesOnly ? "active" : ""}`}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                {showFavoritesOnly ? "★" : "☆"} {t.favorites} {favoriteIds.size > 0 && `(${favoriteIds.size})`}
              </button>
            </div>
          </div>
        )}

        {/* Floating map controls (right side) */}
        <div className="m-map-controls">
          <button className="m-map-btn" onClick={locateUser} title={t.myLocation}>📍</button>
          <button className="m-map-btn" onClick={toggleTheme}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="m-map-btn" onClick={() => setMapMode(mapMode === "schema" ? "satellite" : "schema")}>
            {mapMode === "schema" ? "🛰️" : "🗺️"}
          </button>
        </div>

        {/* Bottom: horizontal swipeable cards */}
        <div className="m-cards-area">
          {nearbyStations.length > 0 && (
            <div className="m-cards-info">
              <span className="m-cards-count">{nearbyStations.length} {fuelLabel}</span>
              <span className="m-cards-cheapest">{t.cheapest}: {cheapestPrice.toFixed(3)}€</span>
            </div>
          )}
          <div className="m-cards-scroll" ref={cardsRef}>
            {nearbyStations.length === 0 && !loading && (
              <div className="m-card m-card-empty">
                {t.noStationsInArea.replace("{fuel}", fuelLabel)}
              </div>
            )}
            {nearbyStations.slice(0, 30).map((s, i) => {
              const isActive = selectedStation?.id === s.id;
              const priceChange = isFavorite(s.id) ? getPriceChange(s.id, fuelKey, s.price) : null;
              const costVsCheapest = (s.price - cheapestPrice) * tankSize;

              return (
                <div
                  key={s.id}
                  className={`m-card ${isActive ? "m-card-active" : ""} ${s.category}`}
                  onClick={() => handleMobileCardClick(s, i)}
                >
                  <div className="m-card-top">
                    <span className={`m-card-rank ${i < 3 ? "top" : ""}`}>{i + 1}</span>
                    <span className={`m-card-price ${s.category}`}>{s.price.toFixed(3)}</span>
                    <span className="m-card-unit">€/L</span>
                    <button
                      className={`m-card-fav ${isFavorite(s.id) ? "active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id, fuelKey, s.price); }}
                    >
                      {isFavorite(s.id) ? "★" : "☆"}
                    </button>
                  </div>
                  <div className="m-card-name">{s.name}</div>
                  <div className="m-card-addr">{s.address}</div>
                  <div className="m-card-bottom">
                    {s.distance != null && (
                      <span className="m-card-dist">
                        {s.distance < 1 ? `${Math.round(s.distance * 1000)}m` : `${s.distance.toFixed(1)}km`}
                      </span>
                    )}
                    {costVsCheapest > 0.01 && (
                      <span className="m-card-extra">+{costVsCheapest.toFixed(2)}€</span>
                    )}
                    {s.price <= cheapestPrice + 0.001 && nearbyStations.length > 1 && (
                      <span className="m-card-best">{t.cheapest}</span>
                    )}
                    {priceChange && (
                      <span className={`m-card-change ${priceChange.direction}`}>
                        {priceChange.direction === "up" ? "▲" : "▼"}{priceChange.amount.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <a
                    className="m-card-nav"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t.getDirections} →
                  </a>
                </div>
              );
            })}
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
            mapMode={mapMode}
            favoriteIds={favoriteIds}
            cheapestPrice={cheapestPrice}
            mostExpensivePrice={mostExpensivePrice}
            tankSize={tankSize}
          />
          <div className="map-controls">
            <button className="map-btn" onClick={locateUser} title={t.myLocation}>📍</button>
            <button className="map-btn" onClick={() => setMapMode(mapMode === "schema" ? "satellite" : "schema")}>
              {mapMode === "schema" ? "🛰️" : "🗺️"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
