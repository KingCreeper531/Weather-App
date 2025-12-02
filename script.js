// Storm Surge Weather — NWS + NOAA Water, ZIP & city search, °F/°C toggle, radar embed, live refresh

// Elements
const searchInput = document.getElementById("search");
const goBtn = document.getElementById("goBtn");
const unitFBtn = document.getElementById("unitF");
const unitCBtn = document.getElementById("unitC");

const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

const locNameEl = document.getElementById("locName");
const nowCard = document.getElementById("nowCard");
const dailyCard = document.getElementById("dailyCard");
const radarCard = document.getElementById("radarCard");
const radarFrame = document.getElementById("radarFrame");
const waterMeta = document.getElementById("waterMeta");
const waterFrame = document.getElementById("waterFrame");

// State
let unit = "F"; // "F" or "C"
let lastContext = null; // { lat, lon, label, periods }

// Geocodio API key
const GEOCODIO_KEY = "a21c2a2fa1cf6a93cc912a2c20643a4f293c641";

// Event wiring
goBtn.addEventListener("click", () => {
  const q = searchInput.value.trim();
  if (!q) {
    showError("Enter a city or ZIP to load weather.");
    return;
  }
  resolveLocation(q);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goBtn.click();
});

unitFBtn.addEventListener("click", () => setUnit("F"));
unitCBtn.addEventListener("click", () => setUnit("C"));

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    tabContents.forEach(c => c.classList.toggle("hidden", c.id !== `${target}Tab`));
  });
});

// Auto-refresh every 5 minutes
setInterval(() => {
  if (lastContext?.lat && lastContext?.lon && lastContext?.label) {
    getNWSForecast(lastContext.lat, lastContext.lon, lastContext.label);
  }
}, 5 * 60 * 1000);

// Unit toggle
function setUnit(next) {
  unit = next;
  unitFBtn.classList.toggle("active", unit === "F");
  unitCBtn.classList.toggle("active", unit === "C");
  if (lastContext?.periods) {
    renderNow(lastContext.periods[0], lastContext.label);
    renderDaily(lastContext.periods);
  }
}

// Location resolution: ZIP via Geocodio, else city via Open‑Meteo geocoding
async function resolveLocation(query) {
  try {
    let lat, lon, label;

    if (/^\d{5}$/.test(query)) {
      const url = `https://api.geocod.io/v1.7/geocode?q=${query}&api_key=${GEOCODIO_KEY}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("ZIP lookup failed.");
      const data = await res.json();
      if (!data.results?.length) throw new Error("ZIP not found.");
      const loc = data.results[0].location;
      lat = loc.lat;
      lon = loc.lng;
      label = data.results[0].address_components.city + ", " + data.results[0].address_components.state;
    } else {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
      );
      if (!geoRes.ok) throw new Error("City lookup failed.");
      const geo = await geoRes.json();
      if (!geo.results?.length) throw new Error("Location not found.");
      const place = geo.results[0];
      lat = place.latitude;
      lon = place.longitude;
      label = place.name + (place.admin1 ? `, ${place.admin1}` : "");
    }

    await getNWSForecast(lat, lon, label);
  } catch (err) {
    showError(err.message || "Location lookup failed.");
  }
}

// NWS forecast fetch and render
async function getNWSForecast(lat, lon, label) {
  try {
    const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
    const pointRes = await fetch(pointsUrl, {
      headers: {
        "Accept": "application/ld+json",
        "User-Agent": "StormSurgeWeather/1.0 (https://kingcreeper531.github.io/Weather-App)"
      }
    });
    if (!pointRes.ok) throw new Error("NWS points request failed.");
    const pointData = await pointRes.json();

    const forecastUrl = pointData?.properties?.forecast;
    if (!forecastUrl) throw new Error("No forecast URL for location.");

    // Set radar early
    setRadar(lat, lon);

    // Forecast
    const forecastRes = await fetch(forecastUrl, {
      headers: {
        "Accept": "application/ld+json",
        "User-Agent": "StormSurgeWeather/1.0 (https://kingcreeper531.github.io/Weather-App)"
      }
    });
    if (!forecastRes.ok) throw new Error("NWS forecast request failed.");
    const forecastData = await forecastRes.json();
    const periods = forecastData?.properties?.periods;
    if (!periods?.length) throw new Error("Forecast periods unavailable.");

    lastContext = { lat, lon, label, periods };

    renderNow(periods[0], label);
    renderDaily(periods);
    setTheme(periods[0]);
    showCard(radarCard);

    // Water embed
    loadWaterData(lat, lon, label);
  } catch (err) {
    showError(err.message || "Failed to fetch NWS forecast.");
  }
}

// Render current conditions
function renderNow(period, label) {
  locNameEl.textContent = label;
  setText("nowTemp", formatTemp(period.temperature, period.temperatureUnit));
  setText("nowSummary", period.shortForecast || "—");

  const windText = `Wind ${period.windSpeed || "—"} • ${period.windDirection || "—"}`;
  setText("nowMeta", windText);

  showCard(nowCard);
}

// Render daily (7 daytime periods)
function renderDaily(periods) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";

  const daily = periods.filter(p => p.isDaytime).slice(0, 7);
  for (const p of daily) {
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `
      <div class="d-date">${p.name}</div>
      <div class="d-temp">${formatTemp(p.temperature, p.temperatureUnit)}</div>
      <div class="d-meta">${p.shortForecast || "—"}</div>
      <div class="d-meta">💨 ${p.windSpeed || "—"} • ${p.windDirection || "—"}</div>
    `;
    daysWrap.appendChild(div);
  }
  showCard(dailyCard);
}

// NOAA Water embed and header text
function loadWaterData(lat, lon, label) {
  const link = `https://water.noaa.gov/?lat=${lat}&lon=${lon}&zoom=9`;
  waterMeta.innerHTML = `
    🌊 NOAA Water near ${label}: <a href="${link}" target="_blank" rel="noopener">Open full map</a><br>
    ℹ️ Live streamflow map embedded below.
  `;
  waterFrame.src = link;
}

// Radar embed
function setRadar(lat, lon) {
  const url = `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&layer=radar&overlay=0&zoom=7&do=radar;`;
  radarFrame.src = url;
}

// Simple theme from forecast keyword
function setTheme(period) {
  const text = (period.shortForecast || "").toLowerCase();
  let accent = "#5dd2ff";
  let surface = "#101722";
  let shadow = "rgba(0,0,0,0.35)";

  if (text.includes("sun") || text.includes("clear")) { accent = "#ffd166"; surface = "#111a24"; }
  else if (text.includes("cloud")) { accent = "#8fb0cc"; surface = "#0f1822"; }
  else if (text.includes("rain") || text.includes("showers")) { accent = "#64a8ff"; surface = "#0e1721"; }
  else if (text.includes("snow")) { accent = "#bfe3ff"; surface = "#0e1720"; }
  else if (text.includes("thunder")) { accent = "#c57bff"; surface = "#0e1520"; }

  setCSS("--theme-accent", accent);
  setCSS("--theme-surface", surface);
  setCSS("--theme-shadow", shadow);
}

// Helpers