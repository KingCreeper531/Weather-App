// Update this with your repo URL and contact email
const appUA = "StormSurgeWeather (github.com/yourname/storm-surge-weather; stormsurgee025@gmail.com)";

// DOM references
const el = {
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  swapUnits: document.getElementById("swap-units"),
  locationTitle: document.getElementById("location-title"),
  updatedAt: document.getElementById("updated-at"),
  tempF: document.getElementById("temp-f"),
  tempC: document.getElementById("temp-c"),
  wind: document.getElementById("wind"),
  humidity: document.getElementById("humidity"),
  alerts: document.getElementById("alerts"),
  forecastList: document.getElementById("forecast-list"),
  themeToggle: document.getElementById("theme-toggle"),
  rainviewerEmbed: document.getElementById("rainviewer-embed"),
  openRainviewer: document.getElementById("open-rainviewer"),
  openWater: document.getElementById("open-water"),
  flow: document.getElementById("flow"),
  flood: document.getElementById("flood"),
};

let unitPrimary = "F"; // primary display (F or C)
let lastPoint = null;  // cache geocode result
let lastForecast = null;

// Theme toggle
el.themeToggle.addEventListener("click", () => {
  const isDark = document.body.getAttribute("data-theme") !== "light";
  document.body.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("ssw-theme", isDark ? "light" : "dark");
});

// Apply saved theme
(() => {
  const saved = localStorage.getItem("ssw-theme");
  if (saved) document.body.setAttribute("data-theme", saved);
})();

// Dual-temp swap
el.swapUnits.addEventListener("click", () => {
  unitPrimary = unitPrimary === "F" ? "C" : "F";
  localStorage.setItem("ssw-unitPrimary", unitPrimary);
  renderTemps(lastForecast?.currentTempF, lastForecast?.currentTempC);
});

// Apply saved unit
(() => {
  const savedUnit = localStorage.getItem("ssw-unitPrimary");
  if (savedUnit === "C" || savedUnit === "F") unitPrimary = savedUnit;
})();

// Search handler
el.searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = (el.searchInput.value || "").trim();
  if (!q) return;
  try {
    const { lat, lon, cityLine } = await geocode(q);
    lastPoint = { lat, lon, cityLine };
    el.locationTitle.textContent = cityLine;
    el.updatedAt.textContent = "Loading...";
    await loadWeather(lat, lon);
    loadRadar(lat, lon);
    loadWater(lat, lon);
  } catch (err) {
    console.error(err);
    el.locationTitle.textContent = "Location not found";
    el.updatedAt.textContent = "—";
  }
});

// Geocode: use Nominatim for city/ZIP to lat/lon (public, no key)
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": appUA } });
  const data = await res.json();
  if (!data?.[0]) throw new Error("No geocode result");
  const top = data[0];
  const lat = parseFloat(top.lat), lon = parseFloat(top.lon);
  const cityLine = top.display_name.split(",").slice(0,3).join(", ");
  return { lat, lon, cityLine };
}

// Weather.gov: points -> forecast + observation + alerts
async function loadWeather(lat, lon) {
  // points endpoint
  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { "User-Agent": appUA, "Accept": "application/geo+json" }
  });
  if (!pointsRes.ok) throw new Error("points fetch failed");
  const points = await pointsRes.json();
  const forecastUrl = points?.properties?.forecast;
  const stationsUrl = points?.properties?.observationStations;

  // forecast
  const fcRes = await fetch(forecastUrl, { headers: { "User-Agent": appUA } });
  const forecast = await fcRes.json();

  // observations: pick first station, then latest observation
  const stRes = await fetch(stationsUrl, { headers: { "User-Agent": appUA } });
  const stations = await stRes.json();
  const firstStation = stations?.features?.[0]?.properties?.stationIdentifier;
  let obs = null;
  if (firstStation) {
    const obRes = await fetch(`https://api.weather.gov/stations/${firstStation}/observations/latest`, {
      headers: { "User-Agent": appUA }
    });
    if (obRes.ok) obs = await obRes.json();
  }

  // alerts for the zone
  const zoneId = points?.properties?.forecastZone?.split("/").pop();
  let alerts = null;
  if (zoneId) {
    const alRes = await fetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`, {
      headers: { "User-Agent": appUA }
    });
    alerts = alRes.ok ? await alRes.json() : null;
  }

  // Current temp from obs if available, else forecast period
  let tempC = obs?.properties?.temperature?.value ?? null; // Celsius
  let tempF = null;
  if (tempC !== null && typeof tempC === "number") {
    tempF = cToF(tempC);
  } else {
    const p0 = forecast?.properties?.periods?.[0];
    tempF = p0?.temperature ?? null;
    tempC = tempF !== null ? fToC(tempF) : null;
  }

  const windSpeed = obs?.properties?.windSpeed?.value; // m/s
  const humidity = obs?.properties?.relativeHumidity?.value; // %
  const windStr = windSpeed != null ? `${msToMph(windSpeed)} mph` : `—`;
  const humStr = humidity != null ? `${Math.round(humidity)}%` : `—`;

  lastForecast = { currentTempF: tempF, currentTempC: tempC };
  renderTemps(tempF, tempC);
  el.wind.textContent = `Wind ${windStr}`;
  el.humidity.textContent = `Humidity ${humStr}`;
  el.updatedAt.textContent = new Date().toLocaleString();

  renderForecast(forecast?.properties?.periods || []);
  renderAlerts(alerts?.features || []);
}

function renderTemps(f, c) {
  const showF = unitPrimary === "F";
  el.tempF.textContent = f != null ? `${Math.round(f)}°F` : `--°F`;
  el.tempC.textContent = c != null ? `${Math.round(c)}°C` : `--°C`;
  el.tempF.style.opacity = showF ? "1" : ".55";
  el.tempC.style.opacity = showF ? ".55" : "1";
}

function renderForecast(periods) {
  el.forecastList.innerHTML = "";
  periods.slice(0, 8).forEach(p => {
    const item = document.createElement("div");
    item.className = "forecast-item";
    const icon = document.createElement("div");
    icon.className = "icon";
    icon.style.background = p.isDaytime
      ? "linear-gradient(135deg,#ffd166,#ffb300)"
      : "linear-gradient(135deg,#8ab4f8,#1a73e8)";
    const period = document.createElement("div");
    period.className = "period";
    period.textContent = p.name;
    const temp = document.createElement("div");
    temp.textContent = `${p.temperature}°${p.temperatureUnit}`;
    item.append(icon, period, temp);
    el.forecastList.appendChild(item);
  });
}

function renderAlerts(features) {
  if (!features || features.length === 0) {
    el.alerts.textContent = "No alerts";
    el.alerts.classList.remove("chip");
    el.alerts.style.background = "";
    return;
  }
  el.alerts.textContent = `${features.length} active alert${features.length>1?"s":""}`;
  el.alerts.classList.add("chip");
  el.alerts.style.background = "linear-gradient(135deg, var(--danger), var(--warn))";
}

// Radar: RainViewer public map, centered at lat/lon via URL params
function loadRadar(lat, lon) {
  const url = `https://www.rainviewer.com/weather-radar-map-live.html?x=${lon}&y=${lat}&z=7`;
  el.rainviewerEmbed.src = url;
  el.openRainviewer.onclick = () => window.open(url, "_blank");
}

// Water: Link to NOAA water dashboard; placeholders for quick signal
function loadWater(lat, lon) {
  el.openWater.onclick = () => window.open("https://water.noaa.gov/", "_blank");
  el.flow.textContent = "Nearby river guidance available";
  el.flood.textContent = "Zoom on water.noaa.gov for inundation maps";
}

// utils
function cToF(c) { return (c * 9) / 5 + 32; }
function fToC(f) { return (f - 32) * 5 / 9; }
function msToMph(ms) { return Math.round(ms * 2.23694); }