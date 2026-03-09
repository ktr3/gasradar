"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLang } from "@/lib/i18n";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const COLORS = {
  cheap: "#34d399",
  mid: "#fbbf24",
  expensive: "#f87171",
};

const COLORS_LIGHT = {
  cheap: "#059669",
  mid: "#d97706",
  expensive: "#dc2626",
};

const GLOW = {
  cheap: "rgba(52, 211, 153, 0.3)",
  mid: "rgba(251, 191, 36, 0.3)",
  expensive: "rgba(248, 113, 113, 0.3)",
};

const TILES = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
};

function MapRef({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    if (mapRef) mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

function UserMarker({ position }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div style="
          width: 18px; height: 18px;
          background: #60a5fa;
          border: 3px solid rgba(255,255,255,0.9);
          border-radius: 50%;
          box-shadow: 0 0 0 6px rgba(96,165,250,0.2), 0 0 16px rgba(96,165,250,0.4);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    []
  );

  return <Marker position={[position.lat, position.lng]} icon={icon} />;
}

export default function StationMap({
  stations, userPos, mapRef, selectedStation, theme, mapMode,
  favoriteIds, cheapestPrice, mostExpensivePrice, tankSize,
}) {
  const { t } = useLang();
  const center = userPos ? [userPos.lat, userPos.lng] : [40.4168, -3.7038];
  const zoom = userPos ? 13 : 6;
  const tileKey = mapMode === "satellite" ? "satellite" : (theme === "light" ? "light" : "dark");
  const tile = TILES[tileKey];
  const colors = theme === "light" ? COLORS_LIGHT : COLORS;
  const favSet = favoriteIds || new Set();

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} zoomControl={true}>
      <MapRef mapRef={mapRef} />
      <TileLayer key={tileKey} attribution={tile.attribution} url={tile.url} />

      {userPos && <UserMarker position={userPos} />}

      {stations.map((s) => {
        const isSelected = selectedStation?.id === s.id;
        const isFav = favSet.has(s.id);
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={isSelected ? 11 : isFav ? 8 : 6}
            fillColor={colors[s.category] || colors.mid}
            color={isSelected ? (theme === "light" ? "#333" : "white") : isFav ? "#f59e0b" : GLOW[s.category] || "transparent"}
            weight={isSelected ? 2.5 : isFav ? 2 : 1}
            fillOpacity={isSelected ? 1 : 0.8}
          >
            <Popup>
              <div className="popup-content">
                <div className="popup-header">
                  <h3>{s.name}</h3>
                  {isFav && <span className="popup-fav-star">★</span>}
                </div>
                <div className="popup-address">{s.address}, {s.locality}</div>
                <div className="popup-price-row">
                  <span className={`popup-price ${s.category}`}>
                    {s.price.toFixed(3)}
                  </span>
                  <span className="popup-price-unit">€/L</span>
                </div>
                {cheapestPrice > 0 && mostExpensivePrice > cheapestPrice && tankSize > 0 && (
                  <div className="popup-savings">
                    {s.price <= cheapestPrice + 0.001 ? (
                      <span className="popup-savings-good">
                        {t.youSave} {((mostExpensivePrice - s.price) * tankSize).toFixed(2)}€ {t.vsExpensive} ({tankSize}{t.liters})
                      </span>
                    ) : (
                      <span className="popup-savings-bad">
                        +{((s.price - cheapestPrice) * tankSize).toFixed(2)}€ {t.moreThanCheapest} ({tankSize}{t.liters})
                      </span>
                    )}
                  </div>
                )}
                {s.schedule && <div className="popup-schedule">{s.schedule}</div>}
                <a
                  className="popup-nav"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.getDirections} →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
