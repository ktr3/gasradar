"use client";

import { useState, useEffect, useContext, createContext, useCallback } from "react";

const translations = {
  es: {
    searchPlaceholder: "Buscar ciudad, dirección o gasolinera...",
    radius: "Radio",
    nearYou: "Cerca de ti",
    cheapest: "Más baratas",
    compareBrands: "Comparar marcas",
    avgByBrand: "Precio medio por marca",
    nationalAvg: "Media nacional",
    stations: "est.",
    noStationsInArea: "No hay gasolineras con {fuel} en esta zona",
    notEnoughData: "No hay suficientes datos para comparar marcas",
    loading: "Cargando gasolineras...",
    myLocation: "Mi ubicación",
    lightMode: "Modo claro",
    darkMode: "Modo oscuro",
    getDirections: "Cómo llegar",
    median: "media",
    lang: "Idioma",
    diesel: "Diésel",
    dieselPlus: "Diésel+",
  },
  en: {
    searchPlaceholder: "Search city, address or station...",
    radius: "Radius",
    nearYou: "Near you",
    cheapest: "Cheapest",
    compareBrands: "Compare brands",
    avgByBrand: "Average price by brand",
    nationalAvg: "National average",
    stations: "st.",
    noStationsInArea: "No stations with {fuel} in this area",
    notEnoughData: "Not enough data to compare brands",
    loading: "Loading stations...",
    myLocation: "My location",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    getDirections: "Get directions",
    median: "mid",
    lang: "Language",
    diesel: "Diesel",
    dieselPlus: "Diesel+",
  },
  eu: {
    searchPlaceholder: "Bilatu hiria, helbidea edo gasolindegi...",
    radius: "Erradioa",
    nearYou: "Zure inguruan",
    cheapest: "Merkeenak",
    compareBrands: "Markak konparatu",
    avgByBrand: "Batez besteko prezioa markaka",
    nationalAvg: "Batez besteko nazionala",
    stations: "glt.",
    noStationsInArea: "{fuel} duten gasolindegi ez dago eremu honetan",
    notEnoughData: "Ez dago nahikoa daturik markak konparatzeko",
    loading: "Gasolindegiak kargatzen...",
    myLocation: "Nire kokapena",
    lightMode: "Modu argia",
    darkMode: "Modu iluna",
    getDirections: "Nola iritsi",
    median: "erdia",
    lang: "Hizkuntza",
    diesel: "Diesela",
    dieselPlus: "Diesel+",
  },
};

const LANG_KEY = "gasolineras_lang";
const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLangState] = useState("es");

  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && translations[saved]) setLangState(saved);
  }, []);

  const setLang = useCallback((l) => {
    setLangState(l);
    localStorage.setItem(LANG_KEY, l);
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export const LANGUAGES = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "eu", label: "EU" },
];
