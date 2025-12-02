// Storm Surge Weather — full app.js with theme + unit persistence, alerts, today card, 7‑day grid, radar, water, and robust error handling

const UA = "StormSurgeWeather (github.com/yourname/storm-surge-weather; contact@example.com)";
const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("search-input"),
  title: document.getElementById("location-title"),
  tempF: document.getElementById("temp-f"),
  tempC: document.getElementById("temp-c"),
  status: document.getElementById("status"),
  windHumidity: document.getElementById("wind-humidity"),
  today: document.getElementById("today-glance"),
  forecast: document.getElementById("forecast"),
  radar: document.getElementById("radar"),
  water: document.getElementById("water-status"),
  alerts: document.getElementById("alerts"),
  unitToggle: document.getElementById("unit-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
};

let unitPrimary = localStorage.getItem("ssw-unit") || "F";
let lastTemps = { f: null, c: null };
let lastLocation = { lat: null, lon: null, name: null };

// Apply saved theme on load
(() => {
  const savedTheme = localStorage.getItem("ssw-theme");
  if (savedTheme) document.body.setAttribute("data-theme", savedTheme);
})();

// Theme toggle
el.themeToggle.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme") || "dark";
  const next = current === "light" ? "dark" : "light";
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("ssw-theme", next);
});

// Unit toggle
el.unitToggle.addEventListener("click", () => {
  unitPrimary = unitPrimary === "F" ? "C" : "F";
  localStorage.setItem("ssw-unit", unitPrimary);
  renderTemps(lastTemps.f, lastTemps.c);
});

// Form submit
el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = el.input.value.trim();
  if (!query) return;
  resetUI();
  try {
    const { lat, lon, location } = await geocode(query);
    lastLocation = { lat, lon, name: location };
    el.title.textContent = location;
    await loadWeather(lat, lon);
    await loadAlerts(lat, lon);
    loadRadar(lat, lon);
    loadWater(lat, lon);
    el.status.textContent = "Updated";
  } catch (err) {
    console.error(err);
    el.title.textContent = "Location not found";
    el.status.textContent = "Error loading data";
  }
});

// Reset UI before each search
function resetUI() {
  el.title.textContent = "Loading...";
  el.status.textContent = "Fetching data...";
  el.windHumidity.textContent = "—";
  el.today.innerHTML = "";
  el.forecast.innerHTML = "";
  el.alerts.innerHTML = "";
  el.water.textContent = "Loading...";
  el.tempF.textContent = "--°F";
  el.tempC.textContent = "--°C";
}

// Geocode via Nominatim (no key)
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const data = await res.json();
  if (!data?.[0]) throw new Error("No geocode result");
  const top = data[0];
  const lat = parseFloat(top.lat);
  const lon = parseFloat(top.lon);
  const location = top.display_name.split(",").slice(0, 3).join(", ");
  return { lat, lon, location };
}

// Weather.gov pipeline: points -> forecast + observations
async function loadWeather(lat, lon) {
  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { "User-Agent": UA, "Accept": "application/geo+json" }
  });
  if (!pointsRes.ok) throw new Error("points fetch failed");
  const points = await pointsRes.json();
  const forecastUrl = points?.properties?.forecast;
  const stationsUrl = points?.properties?.observationStations;

  // Forecast
  const fcRes = await fetch(forecastUrl, { headers: { "User-Agent": UA } });
  const forecast = await fcRes.json();
  const periods = forecast?.properties?.periods || [];

  renderToday(periods[0]);
  renderForecast(periods.slice(0, 7));

  // Observations (latest from first station)
  let obs = null;
  try {
    const stRes = await fetch(stationsUrl, { headers: { "User-Agent": UA } });
    const stations = await stRes.json();
    const stationId = stations?.features?.[0]?.properties?.stationIdentifier;
    if (stationId) {
      const obRes = await fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`, {
        headers: { "User-Agent": UA }
      });
      if (obRes.ok) obs = await obRes.json();
    }
  } catch {
    // Observations may be unavailable — handled by fallbacks
  }

  // Current temps: prefer obs; fallback to forecast period
  let tempC = obs?.properties?.temperature?.value ?? null; // Celsius
  let tempF = null;
  if (typeof tempC === "number") {
    tempF = cToF(tempC);
  } else {
    const p0 = periods[0];
    if (p0?.temperature != null) {
      if ((p0.temperatureUnit || "").toUpperCase() === "F") {
        tempF = p0.temperature;
        tempC = fToC(tempF);
      } else {
        tempC = p0.temperature;
        tempF = cToF(tempC);
      }
    }
  }
  lastTemps = { f: tempF, c: tempC };
  renderTemps(tempF, tempC);

  // Wind/Humidity from obs if available
  const windMs = obs?.properties?.windSpeed?.value;
  const humPct = obs?.properties?.relativeHumidity?.value;
  const windStr = windMs != null ? `${msToMph(windMs).toFixed(0)} mph` : "--";
  const humStr = humPct != null ? `${Math.round(humPct)}%` : "--";
  el.windHumidity.textContent = `Wind ${windStr} • Humidity ${humStr}`;
}

// Render today card
function renderToday(p) {
  if (!p) {
    el.today.innerHTML = `<div class="forecast-day">No forecast data available.</div>`;
    return;
  }
  el.today.innerHTML = `
    <div class="forecast-day">
      <div><strong>${p.name}:</strong> ${p.temperature}°${p.temperatureUnit}, ${p.shortForecast}</div>
      <div class="muted">${p.detailedForecast}</div>
    </div>
  `;
}

// Render 7-day forecast grid
function renderForecast(days) {
  el.forecast.innerHTML = days.map(d => `
    <div class="forecast-day">
      <div class="row">
        <span class="day"><strong>${d.name}</strong></span>
        <span class="temp">${d.temperature}°${d.temperatureUnit}</span>
      </div>
      <div class="desc">${d.shortForecast}</div>
    </div>
  `).join("");
}

// Render temperatures with unit emphasis
function renderTemps(f, c) {
  const showF = unitPrimary === "F";
  el.tempF.textContent = f != null ? `${Math.round(f)}°F` : `--°F`;
  el.tempC.textContent = c != null ? `${Math.round(c)}°C` : `--°C`;
  el.tempF.style.opacity = showF ? "1" : "0.55";
  el.tempC.style.opacity = showF ? "0.55" : "1";
}

// Alerts via forecast zone
async function loadAlerts(lat, lon) {
  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { "User-Agent": UA }
    });
    if (!pointsRes.ok) throw new Error("points for alerts failed");
    const points = await pointsRes.json();
    const zoneId = points?.properties?.forecastZone?.split("/").pop();
    if (!zoneId) {
      el.alerts.innerHTML = "";
      return;
    }
    const alRes = await fetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`, {
      headers: { "User-Agent": UA }
    });
    if (!alRes.ok) {
      el.alerts.innerHTML = "";
      return;
    }
    const alerts = await alRes.json();
    const features = alerts?.features || [];
    if (features.length === 0) {
      el.alerts.innerHTML = "";
      return;
    }
    el.alerts.innerHTML = features.slice(0, 3).map(a => {
      const props = a.properties || {};
      const title = props.event || "Alert";
      const severity = props.severity || "Unknown";
      const area = (props.areaDesc || "").split(";").slice(0, 1).join("");
      return `
        <div class="alert-banner">
          <strong>${title}</strong> — ${severity}${area ? ` • ${area}` : ""}
        </div>
      `;
    }).join("");
  } catch {
    el.alerts.innerHTML = "";
  }
}

// Radar embed (RainViewer centered at lat/lon)
function loadRadar(lat, lon) {
  el.radar.src = `https://www.rainviewer.com/weather-radar-map-live.html?x=${lon}&y=${lat}&z=7`;
}

// NOAA Water placeholder
function loadWater() {
  el.water.textContent = "Nearby river guidance available via NOAA Water Dashboard";
}

// Utils
function cToF(c) { return (c * 9) / 5 + 32; }
function fToC(f) { return (f - 32) * 5 / 9; }
function msToMph(ms) { return ms * 2.23694; }