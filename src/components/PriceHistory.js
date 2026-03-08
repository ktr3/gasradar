"use client";

import { useMemo } from "react";

export default function PriceStats({ stations, fuelLabel, t }) {
  const brandStats = useMemo(() => {
    if (!stations.length) return [];

    const byBrand = {};
    stations.forEach((s) => {
      const brand = s.name.toUpperCase().trim();
      if (!byBrand[brand]) byBrand[brand] = { prices: [], brand };
      byBrand[brand].prices.push(s.price);
    });

    return Object.values(byBrand)
      .filter((b) => b.prices.length >= 20)
      .map((b) => {
        const sorted = b.prices.sort((a, c) => a - c);
        const avg = sorted.reduce((a, c) => a + c, 0) / sorted.length;
        return {
          brand: b.brand,
          avg,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          count: sorted.length,
        };
      })
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 10);
  }, [stations]);

  const globalAvg = useMemo(() => {
    if (!stations.length) return 0;
    return stations.reduce((a, s) => a + s.price, 0) / stations.length;
  }, [stations]);

  if (!brandStats.length) {
    return (
      <div className="stats-section">
        <div className="history-empty">
          {t.notEnoughData}
        </div>
      </div>
    );
  }

  const maxAvg = brandStats[brandStats.length - 1].avg;
  const minAvg = brandStats[0].avg;

  return (
    <div className="stats-section">
      <div className="stats-section-header">
        <h3>{t.avgByBrand} — {fuelLabel}</h3>
        <span className="stats-section-sub">
          {t.nationalAvg}: <strong>{globalAvg.toFixed(3)}€</strong>
        </span>
      </div>

      <div className="brand-list">
        {brandStats.map((b, i) => {
          const diff = b.avg - globalAvg;
          const diffPct = ((diff / globalAvg) * 100).toFixed(1);
          const barWidth = ((b.avg - minAvg) / (maxAvg - minAvg || 0.01)) * 100;
          const isBelow = diff < -0.002;
          const isAbove = diff > 0.002;

          return (
            <div key={b.brand} className="brand-row">
              <div className="brand-rank-col">
                <span className={`brand-rank ${i < 3 ? "brand-rank-top" : ""}`}>
                  {i + 1}
                </span>
              </div>
              <div className="brand-info-col">
                <div className="brand-name-row">
                  <span className="brand-name">{b.brand}</span>
                  <span className="brand-count">{b.count} {t.stations}</span>
                </div>
                <div className="brand-bar-track">
                  <div
                    className={`brand-bar-fill ${isBelow ? "bar-cheap" : isAbove ? "bar-expensive" : "bar-mid"}`}
                    style={{ width: `${Math.max(barWidth, 5)}%` }}
                  />
                </div>
              </div>
              <div className="brand-price-col">
                <span className={`brand-price ${isBelow ? "cheap" : isAbove ? "expensive" : "mid"}`}>
                  {b.avg.toFixed(3)}
                </span>
                <span className={`brand-diff ${isBelow ? "diff-cheap" : isAbove ? "diff-expensive" : "diff-mid"}`}>
                  {diff > 0 ? "+" : ""}{diffPct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
