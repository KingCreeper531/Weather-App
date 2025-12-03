// Storm Surge Weather — Mapbox + AmbientWeather + Open-Meteo + NWS + USGS (no mPING)

const MAPBOX_TOKEN = window.SSW_MAPBOX_TOKEN;
const AMBIENT_API_KEY = window.SSW_AMBIENT_KEY;

mapboxgl.accessToken = MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-82.0, 40.0],
  zoom: 5
});
map.addControl(new mapboxgl.NavigationControl(), "top-right");

// Elements
const input = document.getElementById("locationInput");
const goBtn = document.getElementById("goBtn");
const unitToggle = document.getElementById("unitToggle");
const refreshBtn = document.getElementById("refreshBtn");
const locateBtn = document.getElementById("locateBtn");

const nowCard = document.getElementById("nowCard");
const todayGrid = document.getElementById("todayGrid");
const dailyGrid = document.getElementById("dailyGrid");
const alertsCard = document.getElementById("alertsCard");
const waterCard = document.getElementById("waterCard");

let unitPrimary = localStorage.getItem("ssw-unit") || "F";
let lastLoc = JSON.parse(localStorage.getItem("ssw-last-loc") || "null");
let refreshTimer = null;
let lastTemps = { f: null, c: null };

// Optional: radar frames (RainViewer-style). Uncomment if you want animation.
// addRadarLayer(); // see function at bottom

// Handlers
goBtn.addEventListener("click", () => {
  const query = input.value.trim();
  if (!query) return;
  resolveLocation(query);
});
input.addEventListener("keydown", e => { if (e.key === "Enter") goBtn.click(); });

unitToggle.addEventListener("click", () => {
  unitPrimary = unitPrimary === "F" ? "C" : "F";
  localStorage.setItem("ssw-unit", unitPrimary);
  reRenderUnits();
});

refreshBtn.addEventListener("click", () => { if (lastLoc) loadAll(lastLoc.lat, lastLoc.lon); });

locateBtn.addEventListener("click", () => {
  if (lastLoc) {
    map.flyTo({ center: [lastLoc.lon, lastLoc.lat], zoom: 8, essential: true });
    addCenterMarker(lastLoc.lat, lastLoc.lon);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  if (lastLoc) {
    input.value = lastLoc.query;
    map.once("load", () => {
      map.flyTo({ center: [lastLoc.lon, lastLoc.lat], zoom: 8 });
      addCenterMarker(lastLoc.lat, lastLoc.lon);
    });
    loadAll(lastLoc.lat, lastLoc.lon);
    setupAutoRefresh();
  } else {
    // Initial AmbientWeather overlay even before search (use your devices)
    loadAmbientStations();
  }
});

/* Resolve ZIP or city to lat/lon */
async function resolveLocation(query) {
  try {
    let lat, lon;
    if (/^\d{5}$/.test(query)) {
      const res = await fetch(`https://api.zippopotam.us/us/${query}`);
      if (!res.ok) throw new Error("ZIP lookup failed");
      const data = await res.json();
      lat = parseFloat(data.places[0].latitude);
      lon = parseFloat(data.places[0].longitude);
    } else {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!data[0]) throw new Error("Location not found");
      lat = parseFloat(data[0].lat);
      lon = parseFloat(data[0].lon);
    }
    lastLoc = { lat, lon, query };
    localStorage.setItem("ssw-last-loc", JSON.stringify(lastLoc));

    map.flyTo({ center: [lon, lat], zoom: 8 });
    addCenterMarker(lat, lon);

    await loadAll(lat, lon);
    setupAutoRefresh();
  } catch (e) {
    showError("Location lookup failed");
  }
}

function setupAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (lastLoc) loadAll(lastLoc.lat, lastLoc.lon);
  }, 10 * 60 * 1000);
}

async function loadAll(lat, lon) {
  let failures = 0;
  await Promise.allSettled([
    loadWeather(lat, lon).catch(() => failures++),
    loadAlerts(lat, lon).catch(() => failures++),
    loadWater(lat, lon).catch(() => failures++),
    loadAmbientStations().catch(() => failures++)
  ]);

  showCard(nowCard);
  showCard(todayGrid);
  showCard(dailyGrid);
  showCard(alertsCard);
  showCard(waterCard);

  if (failures > 0) showOffline("⚠️ Some data sources unavailable at last refresh");
  else clearOffline();
}

/* Weather via Open-Meteo */
async function loadWeather(lat, lon) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,wind_speed_10m,apparent_temperature,weather_code");
    url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,time");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,time");
    url.searchParams.set("temperature_unit", unitPrimary === "F" ? "fahrenheit" : "celsius");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Forecast fetch failed");
    const data = await res.json();

    renderNowOM(data);
    renderHoursOM(data);
    renderDailyOM(data);

    setUpdated("updated-now");
    setUpdated("updated-today");
    setUpdated("updated-daily");
  } catch (e) {
    showOffline("⚠️ Weather data unavailable");
    showError("Failed to fetch forecast.");
  }
}

function renderNowOM(data) {
  const c = data.current || {};
  const temp = c.temperature_2m;
  const feels = c.apparent_temperature;
  const wind = c.wind_speed_10m;
  const hum = c.relative_humidity_2m;
  const code = c.weather_code;

  lastTemps.f = unitPrimary === "F" ? temp : cToF(temp);
  lastTemps.c = unitPrimary === "C" ? temp : fToC(temp);

  const shownTemp = unitPrimary === "F" ? lastTemps.f : lastTemps.c;

  document.getElementById("nowTemp").textContent = Number.isFinite(shownTemp) ? `${Math.round(shownTemp)}°` : `--°`;
  document.getElementById("nowFeels").textContent = `Feels like ${Number.isFinite(feels) ? Math.round(feels) : "--"}°`;
  document.getElementById("nowWind").textContent = `Wind ${Number.isFinite(wind) ? Math.round(wind) : "--"} mph`;
  document.getElementById("nowHum").textContent = `Humidity ${Number.isFinite(hum) ? Math.round(hum) : "--"}%`;
  document.getElementById("nowSummary").textContent = codeToSummary(code);

  setIconTheme(code);
}

function renderHoursOM(data) {
  const times = data.hourly?.time || [];
  const temps = data.hourly?.temperature_2m || [];
  const winds = data.hourly?.wind_speed_10m || [];
  const hums = data.hourly?.relative_humidity_2m || [];
  const precs = data.hourly?.precipitation || [];
  const codes = data.hourly?.weather_code || [];

  const hoursWrap = document.getElementById("hours");
  hoursWrap.innerHTML = "";

  const sliceEnd = Math.min(8, times.length);
  for (let i = 0; i < sliceEnd; i++) {
    const t = new Date(times[i]);
    const label = t.toLocaleTimeString([], { hour: "numeric" });

    const tempRaw = temps[i];
    const wind = winds[i];
    const hum = hums[i];
    const prec = precs[i];
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${label}</div>
      <div class="h-temp">${Number.isFinite(tempRaw) ? Math.round(tempRaw) : "--"}°</div>
      <div class="h-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
      <div class="h-meta">💨 ${Number.isFinite(wind) ? Math.round(wind) : "--"} mph • 💧 ${Number.isFinite(hum) ? Math.round(hum) : "--"}% • ☔ ${Number.isFinite(prec) ? prec.toFixed(2) : "0.00"}"</div>
    `;
    hoursWrap.appendChild(div);
  }
}

/* Daily forecast */
function renderDailyOM(data) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";

  const times = data.daily?.time || [];
  const tmax = data.daily?.temperature_2m_max || [];
  const tmin = data.daily?.temperature_2m_min || [];
  const codes = data.daily?.weather_code || [];

  for (let i = 0; i < Math.min(7, times.length); i++) {
    const label = new Date(times[i]).toLocaleDateString([], { weekday: "short" });
    const hiRaw = tmax[i];
    const loRaw = tmin[i];
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${label}</div>
      <div class="h-temp">${Number.isFinite(hiRaw) ? Math.round(hiRaw) : "--"}°${Number.isFinite(loRaw) ? ` / ${Math.round(loRaw)}°` : ""}</div>
      <div class="h-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
    `;
    daysWrap.appendChild(div);
  }
}

/* NWS alerts */
async function loadAlerts(lat, lon) {
  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    if (!pointsRes.ok) throw new Error("points failed");
    const points = await pointsRes.json();
    const zoneId = points?.properties?.forecastZone?.split("/").pop();
    if (!zoneId) throw new Error("no zone");

    const alRes = await fetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`);
    if (!alRes.ok) throw new Error("alerts failed");
    const alerts = await alRes.json();
    const features = alerts?.features || [];

    const html = features.slice(0, 4).map(a => {
      const p = a.properties || {};
      const title = p.event || "Alert";
      const severity = (p.severity || "").toLowerCase();
      const area = (p.areaDesc || "").split(";").slice(0,1).join("");
      const cls =
        severity === "severe" ? "alert-severe" :
        severity === "moderate" ? "alert-moderate" :
        "alert-minor";
      return `<div class="alert-banner ${cls}"><strong>${title}</strong> — ${p.severity || "—"}${area ? ` • ${area}` : ""}</div>`;
    }).join("");

    document.getElementById("alerts").innerHTML = html || `<div class="muted">No active alerts.</div>`;
    setUpdated("updated-alerts");
  } catch (e) {
    document.getElementById("alerts").innerHTML = `<div class="muted">Alerts unavailable.</div>`;
    showOffline("⚠️ Alerts unavailable");
  }
}

/* USGS water gauges */
async function loadWater(lat, lon) {
  try {
    const status = document.getElementById("water-status");
    status.textContent = "Finding nearby gauges…";

    const siteUrl = `https://waterservices.usgs.gov/nwis/site/?format=json&lat=${lat}&lon=${lon}&radius=40&siteType=ST&hasDataTypeCd=iv`;
    const siteRes = await fetch(siteUrl);
    if (!siteRes.ok) throw new Error("site search failed");
    const sitesJson = await siteRes.json();
    const siteArr = extractSitesFromJson(sitesJson);
    const topSites = siteArr.slice(0, 4);

    const gaugesEl = document.getElementById("gauges");
    gaugesEl.innerHTML = "";

    if (topSites.length === 0) {
      status.textContent = "No nearby river gauges found.";
      setUpdated("updated-water");
      return;
    }

    status.textContent = `Showing ${topSites.length} nearby gauges`;

    for (const site of topSites) {
      const ivUrl = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00060,00065&siteStatus=active`;
      const ivRes = await fetch(ivUrl);
      if (!ivRes.ok) continue;
      const ivJson = await ivRes.json();
      const { name, flow, stage, trend } = parseUSGSInstant(ivJson);

      const card = document.createElement("div");
      card.className = "gauge-card";
      card.innerHTML = `
        <div class="gauge-title">${name || site}</div>
        <div class="gauge-values">
          <span class="badge flow">Flow: ${flow != null ? `${Math.round(flow)} cfs` : "—"}</span>
          <span class="badge stage">Stage: ${stage != null ? `${stage.toFixed(2)} ft` : "—"}</span>
          <span class="badge ${trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : ""}">
            ${trend ? `Trend: ${trend}` : ""}
          </span>
        </div>
      `;
      gaugesEl.appendChild(card);
    }

    setUpdated("updated-water");
  } catch (e) {
    document.getElementById("water-status").textContent = "Error loading gauges.";
    showOffline("⚠️ River gauges unavailable");
  }
}

/* AmbientWeather integration */
async function loadAmbientStations() {
  try {
    const url = `https://api.ambientweather.net/v1/devices?apiKey=${AMBIENT_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("AmbientWeather fetch failed");
    const stations = await res.json();

    const features = stations.map(st => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [st.info.lon, st.info.lat] },
      properties: {
        name: st.info.name || st.macAddress,
        temp: st.lastData?.tempf,
        rain: st.lastData?.hourlyrainin,
        wind: st.lastData?.windspeedmph,
        humidity: st.lastData?.humidity
      }
    })).filter(f => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));

    const geojson = { type: "FeatureCollection", features };

    if (map.getSource("ambient")) {
      map.getSource("ambient").setData(geojson);
    } else {
      map.addSource("ambient", { type: "geojson", data: geojson });
      map.addLayer({
        id: "ambient-layer",
        type: "circle",
        source: "ambient",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "rain"], 0],
            0, "#9bffb5",
            0.1, "#00c853",
            0.5, "#2196f3",
            1.0, "#ff9800",
            2.0, "#f44336"
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0b0f14"
        }
      });

      map.on("click", "ambient-layer", (e) => {
        const p = e.features[0].properties;
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <strong>${p.name || "Station"}</strong><br>
            🌡️ Temp: ${p.temp ?? "—"} °F<br>
            💧 Rain: ${p.rain ?? 0} in/hr<br>
            💨 Wind: ${p.wind ?? "—"} mph<br>
            Humidity: ${p.humidity ?? "—"}%
          `)
          .addTo(map);
      });
    }
  } catch (err) {
    showOffline("⚠️ AmbientWeather data unavailable");
  }
}

/* Helpers */
function addCenterMarker(lat, lon) {
  if (map.getSource("center-point")) {
    map.removeLayer("center-point-layer");
    map.removeSource("center-point");
  }
  map.addSource("center-point", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] } } });
  map.addLayer({
    id: "center-point-layer",
    type: "circle",
    source: "center-point",
    paint: { "circle-radius": 6, "circle-color": "#5dd2ff", "circle-stroke-width": 2, "circle-stroke-color": "#0b0f14" }
  });
}

function showCard(el) { el.classList.remove("hidden"); el.classList.add("show"); }
function showError(msg) {
  showCard(nowCard);
  document.getElementById("nowTemp").textContent = `--°`;
  document.getElementById("nowSummary").textContent = msg;
  document.getElementById("nowFeels").textContent = `Feels like --°`;
  document.getElementById("nowWind").textContent = `Wind -- mph`;
  document.getElementById("nowHum").textContent = `Humidity --%`;
}
function setUpdated(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = "Last updated: " + new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
}
function showOffline(msg) {
  const banner = document.getElementById("offlineBanner");
  banner.textContent = msg;
  banner.classList.remove("hidden");
}
function clearOffline() {
  const banner = document.getElementById("offlineBanner");
  banner.classList.add("hidden");
}

/* Weather code mapping */
function codeToSummary(code) {
  const map = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Light snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm (hail)", 99: "Thunderstorm (heavy hail)"
  };
  return map[code] ?? "—";
}
function codeToEmoji(code) {
  if ([0,1].includes(code)) return "☀️";
  if ([2].includes(code)) return "🌤️";
  if ([3,45,48].includes(code)) return "☁️";
  if ([51,53,55,61,63,65,80,81,82].includes(code)) return "🌧️";
  if ([71,73,75].includes(code)) return "❄️";
  if ([95,96,99].includes(code)) return "⛈️";
  return "🌡️";
}
function setIconTheme(code) {
  const sun = document.querySelector(".icon-sun");
  const cloud = document.querySelector(".icon-cloud");
  if (!sun || !cloud) return;
  sun.style.filter = ""; cloud.style.filter = "";

  if ([0,1].includes(code)) {
    sun.style.opacity = "1"; cloud.style.opacity = "0.15";
  } else if ([2].includes(code)) {
    sun.style.opacity = "0.9"; cloud.style.opacity = "0.6";
  } else if ([3,45,48].includes(code)) {
    sun.style.opacity = "0.25"; cloud.style.opacity = "0.95";
  } else if ([51,53,55,61,63,65,80,81,82].includes(code)) {
    sun.style.opacity = "0.2"; cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 20px rgba(110,140,170,0.45))";
  } else if ([71,73,75].includes(code)) {
    sun.style.opacity = "0.2"; cloud.style.opacity = "1";
  } else if ([95,96,99].includes(code)) {
    sun.style.opacity = "0.15"; cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 24px rgba(150,110,170,0.5))";
  }
}

/* Conversions */
function cToF(c) { return (c * 9) / 5 + 32; }
function fToC(f) { return (f - 32) * 5 / 9; }

/* USGS helpers */
function extractSitesFromJson(json) {
  const arr = json?.value?.site ?? [];
  return arr.map(s => s?.siteCode?.[0]?.value).filter(Boolean);
}
function parseUSGSInstant(json) {
  const ts = json?.value?.timeSeries ?? [];
  let name = null, flow = null, stage = null, trend = null;
  if (ts[0]?.sourceInfo?.siteName) name = ts[0].sourceInfo.siteName;
  const flowSeries = ts.find(s => s.variable?.variableCode?.[0]?.value === "00060");
  const stageSeries = ts.find(s => s.variable?.variableCode?.[0]?.value === "00065");
  const flowVals = (flowSeries?.values?.[0]?.value ?? []).slice(-3).map(v => parseFloat(v?.value));
  const stageVals = (stageSeries?.values?.[0]?.value ?? []).slice(-3).map(v => parseFloat(v?.value));
  flow = Number.isFinite(flowVals.slice(-1)[0]) ? flowVals.slice(-1)[0] : null;
  stage = Number.isFinite(stageVals.slice(-1)[0]) ? stageVals.slice(-1)[0] : null;
  const delta = (Number.isFinite(stageVals[0]) && Number.isFinite(stageVals.slice(-1)[0]))
    ? stageVals.slice(-1)[0] - stageVals[0]
    : null;
  trend = delta != null ? (delta > 0.02 ? "up" : delta < -0.02 ? "down" : "steady") : null;
  return { name, flow, stage, trend };
}

/* Optional: simple radar layer (RainViewer tile cache)
   If you want a live radar loop like XtremeWX, we can add a timestamp fetch and animate frames.
   This static layer shows the latest composite; animation can be added on request. */
async function addRadarLayer() {
  try {
    // Latest radar composite timestamp (example static; replace with a fetch to their timestamps API if available)
    const timestamp = "latest"; // or e.g. 1699999999 provided by a frames list
    const sourceId = "radar";
    const layerId = "radar-layer";

    const template = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/2/1_1.png`;

    if (map.getSource(sourceId)) {
      map.removeLayer(layerId);
      map.removeSource(sourceId);
    }

    map.addSource(sourceId, {
      type: "raster",
      tiles: [template],
      tileSize: 256
    });

    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": 0.7
      }
    }, // place below labels
    "road-label");
  } catch (e) {
    showOffline("⚠️ Radar layer unavailable");
  }
}