"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "gasolineras_favorites";

function loadFavorites() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveFavorites(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function useFavorites() {
  const [favData, setFavData] = useState({});

  useEffect(() => {
    setFavData(loadFavorites());
  }, []);

  const toggleFavorite = useCallback((stationId, fuelKey, currentPrice) => {
    setFavData((prev) => {
      const next = { ...prev };
      if (next[stationId]) {
        delete next[stationId];
      } else {
        next[stationId] = {
          addedAt: Date.now(),
          lastSeenPrice: { [fuelKey]: currentPrice },
          lastVisit: Date.now(),
        };
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (stationId) => !!favData[stationId],
    [favData]
  );

  const getPriceChange = useCallback(
    (stationId, fuelKey, currentPrice) => {
      const fav = favData[stationId];
      if (!fav || !fav.lastSeenPrice || fav.lastSeenPrice[fuelKey] == null) return null;
      const prev = fav.lastSeenPrice[fuelKey];
      const diff = currentPrice - prev;
      if (Math.abs(diff) < 0.001) return null;
      return {
        direction: diff > 0 ? "up" : "down",
        amount: Math.abs(diff),
      };
    },
    [favData]
  );

  // Update stored prices for all visible favorites
  const updatePrices = useCallback((stations, fuelKey) => {
    setFavData((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of stations) {
        if (next[s.id]) {
          const oldPrice = next[s.id].lastSeenPrice?.[fuelKey];
          if (oldPrice !== s.price) {
            next[s.id] = {
              ...next[s.id],
              lastSeenPrice: { ...next[s.id].lastSeenPrice, [fuelKey]: s.price },
              lastVisit: Date.now(),
            };
            changed = true;
          }
        }
      }
      if (changed) saveFavorites(next);
      return changed ? next : prev;
    });
  }, []);

  const favoriteIds = new Set(Object.keys(favData));

  return { favData, favoriteIds, toggleFavorite, isFavorite, getPriceChange, updatePrices };
}
