"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLang } from "@/lib/i18n";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fuzzyMatch(query, text) {
  const nq = normalize(query);
  const nt = normalize(text);
  if (nt.startsWith(nq)) return 2;
  if (nt.includes(nq)) return 1;
  // check if all chars appear in order (loose fuzzy)
  let qi = 0;
  for (let i = 0; i < nt.length && qi < nq.length; i++) {
    if (nt[i] === nq[qi]) qi++;
  }
  return qi === nq.length ? 0.5 : 0;
}

export default function SearchBar({ stations, onSelectLocation, onSelectStation }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Extract unique localities for instant suggestions
  const localities = useMemo(() => {
    const map = {};
    stations.forEach((s) => {
      const key = s.locality.toUpperCase().trim();
      if (!key) return;
      if (!map[key]) {
        map[key] = { name: s.locality, municipality: s.municipality, province: s.province, lat: s.lat, lng: s.lng, count: 0 };
      }
      map[key].count++;
      // average position
      map[key].lat = (map[key].lat * (map[key].count - 1) + s.lat) / map[key].count;
      map[key].lng = (map[key].lng * (map[key].count - 1) + s.lng) / map[key].count;
    });
    return Object.values(map);
  }, [stations]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Instant local search (no debounce)
  const localSearch = useCallback(
    (q) => {
      if (!q || q.length < 2) return [];
      const items = [];

      // Fuzzy match localities
      const matchedLocalities = localities
        .map((loc) => ({ ...loc, score: Math.max(fuzzyMatch(q, loc.name), fuzzyMatch(q, loc.municipality)) }))
        .filter((loc) => loc.score > 0)
        .sort((a, b) => b.score - a.score || b.count - a.count)
        .slice(0, 4);

      matchedLocalities.forEach((loc) => {
        items.push({
          type: "locality",
          label: loc.name,
          sub: `${loc.province} — ${loc.count} ${t.stations}`,
          data: { lat: loc.lat, lng: loc.lng },
        });
      });

      // Fuzzy match stations
      const matchedStations = stations
        .map((s) => ({
          ...s,
          score: Math.max(fuzzyMatch(q, s.name), fuzzyMatch(q, s.address), fuzzyMatch(q, s.locality)),
        }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      matchedStations.forEach((s) => {
        items.push({
          type: "station",
          label: s.name,
          sub: `${s.address}, ${s.locality} — ${s.price.toFixed(3)}€/L`,
          data: s,
        });
      });

      return items;
    },
    [stations, localities, t]
  );

  // Remote Nominatim search (debounced)
  const remoteSearch = useCallback(
    async (q) => {
      if (!q || q.length < 3) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          format: "json",
          countrycodes: "es",
          limit: "5",
          addressdetails: "1",
        });
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
          headers: { "Accept-Language": "es" },
        });
        const places = await res.json();
        const nominatimItems = places.map((p) => {
          const bb = p.boundingbox;
          return {
            type: "location",
            label: p.display_name.split(",").slice(0, 2).join(","),
            sub: p.display_name.split(",").slice(2, 4).join(",").trim(),
            data: {
              lat: parseFloat(p.lat),
              lng: parseFloat(p.lon),
              bounds: bb
                ? [
                    [parseFloat(bb[0]), parseFloat(bb[2])],
                    [parseFloat(bb[1]), parseFloat(bb[3])],
                  ]
                : null,
            },
          };
        });

        setResults((prev) => {
          // Merge: keep local results, add nominatim results that aren't duplicates
          const localItems = prev.filter((r) => r.type !== "location");
          const merged = [...localItems, ...nominatimItems];
          return merged;
        });
        setOpen(true);
      } catch {
        // Nominatim failed, keep local results
      }
      setLoading(false);
    },
    []
  );

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);

    // Instant local results
    const local = localSearch(val);
    setResults(local);
    setOpen(local.length > 0);

    // Debounced remote search
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => remoteSearch(val), 400);
  };

  const handleSelect = (item) => {
    setOpen(false);
    setQuery("");
    if (item.type === "station") {
      onSelectStation(item.data);
    } else {
      onSelectLocation(item.data);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const iconForType = (type) => {
    if (type === "station") return "⛽";
    if (type === "locality") return "🏘️";
    return "📍";
  };

  const iconClassForType = (type) => {
    if (type === "station") return "station-icon";
    return "location-icon";
  };

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <div className="search-box">
        <span className="search-icon">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && (
          <button className="search-clear" onClick={handleClear}>
            ✕
          </button>
        )}
        {loading && <div className="search-spinner" />}
      </div>

      {open && (
        <div className="search-dropdown">
          {results.map((item, i) => (
            <div
              key={`${item.type}-${i}`}
              className="search-result"
              onClick={() => handleSelect(item)}
            >
              <span className={`search-result-icon ${iconClassForType(item.type)}`}>
                {iconForType(item.type)}
              </span>
              <div className="search-result-text">
                <div className="search-result-label">{item.label}</div>
                <div className="search-result-sub">{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
