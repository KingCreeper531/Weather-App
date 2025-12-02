// Storm Surge — Recode
// ZIP (Zipcodebase) + City (Open‑Meteo) → NWS forecast, RainViewer radar, NOAA Water
// Dual °F/°C, hourly glance, 7‑day, resilient errors, auto refresh

const searchInput = document.getElementById("search");
const goBtn = document.getElementById("goBtn");

const locNameEl = document.getElementById("locName");
const nowCard = document.getElementById("nowCard");
const hourlyCard = document.getElementById("hourlyCard");
const dailyCard = document.getElementById("dailyCard");
const radarCard = document.getElementById("radarCard");
const waterCard = document.getElementById("waterCard");

const radarFrame = document.getElementById("radarFrame");
const waterMeta = document.getElementById("waterMeta");
const waterFrame = document.getElementById("waterFrame");

const nowSkeleton = document.getElementById("nowSkeleton");
const hourlySkeleton = document.getElementById("hourlySkeleton");
const dailySkeleton = document.getElementById("dailySkeleton");

let lastContext = null;

// Replace with your key or keep as env injected via build tooling
const ZIPCODEBASE_KEY = "0d3e1960-cfc1-11f0-88a7-ab5476d59c85";

goBtn.addEventListener("click", () => {
  const q = searchInput.value.trim();
  if (!q) return;
  run(q);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goBtn.click();
});

// Periodic refresh
setInterval(() => {
  if (lastContext?.lat && lastContext?.lon && lastContext?.label) {
    getForecast(lastContext.lat, lastContext.lon, lastContext.label);
  }
}, 5 * 60 * 1000);

// Main flow
async function run(query) {
  try {
    setLoading(true);
    const { lat, lon, label } = await resolveLocation(query);
    await getForecast(lat, lon, label);
  } catch (err) {
    showError(err.message || "Something went wrong.");
  } finally {
    setLoading(false);
  }
}

// Resolve location via ZIP (Zipcodebase) or city (Open‑Meteo)
async function resolveLocation(query) {
  let lat, lon, label;
  const q = query.trim();

  if (/^\d{5}$/.test(q)) {
    const url = `https://app.zipcodebase.com/api/v1/search?codes=${q}&country=US`;
    const res = await fetch(url, { headers: { apikey: ZIPCODEBASE_KEY } });
    if (!res.ok) throw new Error("ZIP lookup failed.");
    const data = await res.json();
    if (!data.results || !data.results[q] || !data.results[q].length) {
      throw new Error("ZIP not found.");
    }
    const loc = data.results[q][0];
    lat = loc.latitude;
    lon = loc.longitude;
    label = `${loc.city}, ${loc.state_code}`;
  } else {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error("City lookup failed.");
    const geo = await geoRes.json();
    if (!geo.results?.length) throw new Error("Location not found.");
    const place = geo.results[0];
    lat = place.latitude;
    lon = place.longitude;
    label = place.name + (place.admin1 ? `, ${place.admin1}` : "");
  }

  return { lat, lon, label };
}

// Fetch forecast from NWS for given lat/lon
async function getForecast(lat, lon, label) {
  // Points lookup
  const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
  const pointRes = await fetch(pointsUrl, {
    headers: { "Accept": "application/ld+json", "User-Agent": "StormSurgeRecode/1.0" }
  });
  if (!pointRes.ok) throw new Error("NWS points request failed.");
  const pointData = await pointRes.json();

  const forecastUrl = pointData?.properties?.forecast;
  const hourlyUrl = pointData?.properties?.forecastHourly;
  if (!forecastUrl) throw new Error("No forecast URL for location.");

  // Radar + Water embeds
  setRadar(lat, lon);
  setWater(lat, lon, label);

  // Forecast data
  const forecastRes = await fetch(forecastUrl, {
    headers: { "Accept": "application/ld+json", "User-Agent": "StormSurgeRecode/1.0" }
  });
  if (!forecastRes.ok) throw new Error("NWS forecast request failed.");
  const forecastData = await forecastRes.json();
  const periods = forecastData?.properties?.periods;
  if (!periods?.length) throw new Error("Forecast periods unavailable.");

  let hourlyPeriods = [];
  if (hourlyUrl) {
    try {
      const hourlyRes = await fetch(hourlyUrl, {
        headers: { "Accept": "application/ld+json", "User-Agent": "StormSurgeRecode/1.0" }
      });
      if (hourlyRes.ok) {
        const hourlyData = await hourlyRes.json();
        hourlyPeriods = hourlyData?.properties?.periods?.slice(0, 8) || [];
      }
    } catch {
      // ignore hourly failure
    }
  }

  lastContext = { lat, lon, label };

  renderNow(periods[0], label);
  renderDaily(periods);
  renderHourly(hourlyPeriods);
  setTheme(periods[0]);
}

// Renderers
function renderNow(period, label) {
  locNameEl.textContent = label;
  setHTML("nowTemp", formatDualTemp(period.temperature, period.temperatureUnit));
  setText("nowSummary", period.shortForecast || "—");
  const windText = `Wind ${period.windSpeed || "—"} • ${period.windDirection || "—"}`;
  setText("nowMeta", windText);
}

function renderDaily(periods) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";
  const daily = periods.filter(p => p.isDaytime).slice(0, 7);
  for (const p of daily) {
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `
      <div class="d-date">${p.name}</div>
      <div class="d-temp">${formatDualTemp(p.temperature, p.temperatureUnit)}</div>
      <div class="d-meta">${p.shortForecast || "—"}</div>
      <div class="d-meta">💨 ${p.windSpeed || "—"} • ${p.windDirection || "—"}</div>
    `;
    daysWrap.appendChild(div);
  }
}

function renderHourly(periods) {
  const wrap = document.getElementById("hourly");
  wrap.innerHTML = "";
  if (!periods.length) {
    wrap.innerHTML = `<div class="d-meta">Hourly data not available.</div>`;
    return;
  }
  for (const p of periods) {
    const t = new Date(p.startTime);
    const time = t.toLocaleTimeString([], { hour: "numeric" });
    const div = document.createElement("div");
    div.className = "hr";
    div.innerHTML = `
      <div class="hr-time">${time}</div>
      <div class="hr-temp">${formatDualTemp(p.temperature, p.temperatureUnit)}</div>
      <div class="d-meta">${p.shortForecast || "—"}</div>
    `;
    wrap.appendChild(div);
  }
}

// Embeds
function setRadar(lat, lon) {
  const url = `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&layer=radar&overlay=0&zoom=7&do=radar;`;
  radarFrame.src = url;
}
function setWater(lat, lon, label) {
  const link = `https://water.noaa.gov/?lat=${lat}&lon=${lon}&zoom=9`;
  waterMeta.innerHTML = `🌊 NOAA Water near ${label}: <a href="${link}" target="_blank" rel="noopener">Open full map</a>`;
  waterFrame.src = link;
}

// Theme
function setTheme(period) {
  const text = (period.shortForecast || "").toLowerCase();
  let accent = "#5dd2ff";
  let surface = "#101722";
  let shadow = "rgba(0,0,0,0.35)";

  if (text.includes("sun") || text.includes("clear")) {
    accent = "#ffd166"; surface = "#111a24";
  } else if (text.includes("cloud")) {
    accent = "#8fb0cc"; surface = "#0f1822";
  } else if (text.includes("rain") || text.includes("showers")) {
    accent = "#64a8ff"; surface = "#0e1721";
  } else if (text.includes("snow")) {
    accent = "#bfe3ff"; surface = "#0e1720";
  } else if (text.includes("thunder")) {
    accent = "#c57bff"; surface = "#0e1520";
  }

  setCSS("--theme-accent", accent);
  setCSS("--theme-surface", surface);
  setCSS("--theme-shadow", shadow);
}

// Loading + errors
function setLoading(isLoading) {
  toggleSkeleton(nowCard, nowSkeleton, isLoading);
  toggleSkeleton(hourlyCard, hourlySkeleton, isLoading);
  toggleSkeleton(dailyCard, dailySkeleton, isLoading);
}
function toggleSkeleton(cardEl, skelEl, isLoading) {
  if (!cardEl || !skelEl) return;
  cardEl.classList.toggle("loading", isLoading);
  skelEl.style.display = isLoading ? "block" : "none";
}
function showError(msg) {
  locNameEl.textContent = "Error";
  setHTML("nowTemp", "--°F<br>--°C");
  setText("nowSummary", msg);
  setText("nowMeta", "Wind -- • Humidity --%");
}

// Helpers
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function setCSS(varName, value) {
  document.documentElement.style.setProperty(varName, value);
}

// Dual temperature display
function formatDualTemp(value, inputUnit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "--°F<br>--°C";
  const f = inputUnit === "C" ? Math.round((v * 9 / 5) + 32) : Math.round(v);
  const c = inputUnit === "F" ? Math.round((v - 32) * 5 / 9) : Math.round(v);
  return `${f}°F<br>${c}°C`;
}