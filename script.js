// Storm Surge Weather — Tomorrow.io full integration (Realtime + Forecast + Recent History + Tiles)

const TOMORROW_KEY = window.SSW_TOMORROW_KEY;
const AMBIENT_API_KEY = window.SSW_AMBIENT_KEY;
const MAPBOX_TOKEN = window.SSW_MAPBOX_TOKEN;
const ENABLE_MAP = true; // set false to disable map if needed

// Units: "metric" or "imperial". We also keep UI toggle for °F/°C display formatting.
let unitsApi = "metric"; // default Tomorrow.io response units
let unitPrimary = localStorage.getItem("ssw-unit") || "F";

let map = null;
let radar = { frames: [], idx: 0, timer: null, speedMs: 800 };

const input = document.getElementById("locationInput");
const goBtn = document.getElementById("goBtn");
const unitToggle = document.getElementById("unitToggle");
const refreshBtn = document.getElementById("refreshBtn");
const locateBtn = document.getElementById("locateBtn");

const nowCard = document.getElementById("nowCard");
const todayGrid = document.getElementById("todayGrid");
const dailyGrid = document.getElementById("dailyGrid");
const waterCard = document.getElementById("waterCard");
const offlineBanner = document.getElementById("offlineBanner");

let lastLoc = JSON.parse(localStorage.getItem("ssw-last-loc") || "null");
let refreshTimer = null;

// Map init
if (ENABLE_MAP && typeof mapboxgl !== "undefined") {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-82.0, 40.0],
    zoom: 5
  });
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
}

// Events
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
  if (lastLoc && map) {
    map.flyTo({ center: [lastLoc.lon, lastLoc.lat], zoom: 8, essential: true });
    addCenterMarker(lastLoc.lat, lastLoc.lon);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  if (lastLoc) {
    input.value = lastLoc.query;
    if (map) {
      map.once("load", () => {
        map.flyTo({ center: [lastLoc.lon, lastLoc.lat], zoom: 8 });
        addCenterMarker(lastLoc.lat, lastLoc.lon);
      });
    }
    loadAll(lastLoc.lat, lastLoc.lon);
    setupAutoRefresh();
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

    if (map) {
      map.flyTo({ center: [lon, lat], zoom: 8 });
      addCenterMarker(lat, lon);
    }

    await loadAll(lat, lon);
    setupAutoRefresh();
  } catch {
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
    loadRealtime(lat, lon).catch(() => failures++),
    loadForecast(lat, lon).catch(() => failures++),
    loadRecentHistory(lat, lon).catch(() => failures++),
    loadWater(lat, lon).catch(() => failures++),
    (map ? loadAmbientStations().catch(() => failures++) : Promise.resolve()),
    (map ? loadRadarFrames(lat, lon).catch(() => failures++) : Promise.resolve())
  ]);

  showCard(nowCard);
  showCard(todayGrid);
  showCard(dailyGrid);
  showCard(waterCard);

  if (failures > 0) showOffline("⚠️ Some data sources unavailable at last refresh");
  else clearOffline();
}

/* Tomorrow.io: Realtime */
async function loadRealtime(lat, lon) {
  const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&units=${unitsApi}&apikey=${TOMORROW_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Realtime fetch failed");
  const data = await res.json();
  renderNowRealtime(data);
  setUpdated("updated-now");
}

/* Tomorrow.io: Forecast */
async function loadForecast(lat, lon) {
  const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&units=${unitsApi}&apikey=${TOMORROW_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Forecast fetch failed");
  const data = await res.json();
  renderHoursForecast(data);
  renderDailyForecast(data);
  setUpdated("updated-today");
  setUpdated("updated-daily");
}

/* Tomorrow.io: Recent history (past ~24h) */
async function loadRecentHistory(lat, lon) {
  const url = `https://api.tomorrow.io/v4/weather/history/recent?location=${lat},${lon}&units=${unitsApi}&apikey=${TOMORROW_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("History fetch failed");
  const data = await res.json();
  // Optional: show a small inline history summary under current
  renderHistorySummary(data);
}

/* Render: Now (Realtime) */
function renderNowRealtime(data) {
  const v = data?.data?.values || {};
  const temp = formatTempFromUnits(v.temperature, unitsApi);
  const feels = formatTempFromUnits(v.temperatureApparent, unitsApi);

  document.getElementById("nowTemp").textContent = temp;
  document.getElementById("nowFeels").textContent = `Feels like ${feels}`;
  document.getElementById("nowWind").textContent = `Wind ${safeRound(v.windSpeed)} ${unitsApi === "imperial" ? "mph" : "m/s"}`;
  document.getElementById("nowHum").textContent = `Humidity ${safeRound(v.humidity)}%`;
  document.getElementById("nowSummary").textContent = codeToSummary(v.weatherCode);
  setIconTheme(v.weatherCode);
}

/* Render: Hourly Forecast */
function renderHoursForecast(data) {
  const hoursWrap = document.getElementById("hours");
  hoursWrap.innerHTML = "";
  const hours = data?.timelines?.hourly?.slice(0, 8) || [];
  for (const h of hours) {
    const t = new Date(h.time);
    const v = h.values || {};
    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${t.toLocaleTimeString([], {hour:"numeric"})}</div>
      <div class="h-temp">${formatTempFromUnits(v.temperature, unitsApi)}</div>
      <div class="h-meta">${codeToEmoji(v.weatherCode)} ${codeToSummary(v.weatherCode)}</div>
      <div class="h-meta">💨 ${safeRound(v.windSpeed)} ${unitsApi === "imperial" ? "mph" : "m/s"} • 💧 ${safeRound(v.humidity)}% • ☔ ${safeFixed(v.precipitationIntensity, 2)} ${unitsApi === "imperial" ? "in/hr" : "mm/hr"}</div>
    `;
    hoursWrap.appendChild(div);
  }
}

/* Render: Daily Forecast with expandable details */
function renderDailyForecast(data) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";
  const days = data?.timelines?.daily?.slice(0, 7) || [];
  for (const d of days) {
    const t = new Date(d.time);
    const v = d.values || {};
    const div = document.createElement("div");
    div.className = "hour expandable";
    div.innerHTML = `
      <div class="h-time">${t.toLocaleDateString([], {weekday:"short"})}</div>
      <div class="h-temp">${formatTempFromUnits(v.temperatureMax, unitsApi)} / ${formatTempFromUnits(v.temperatureMin, unitsApi)}</div>
      <div class="h-meta">${codeToEmoji(v.weatherCodeMax)} ${codeToSummary(v.weatherCodeMax)}</div>
      <div class="h-details hidden">
        💨 Wind (avg): ${safeRound(v.windSpeedAvg)} ${unitsApi === "imperial" ? "mph" : "m/s"}<br>
        💧 Humidity (avg): ${safeRound(v.humidityAvg)}%<br>
        ☔ Precip prob (avg): ${safeFixed(v.precipitationProbabilityAvg, 0)}%<br>
        🌡️ UV Index (avg): ${safeRound(v.uvIndexAvg)}
      </div>
    `;
    div.addEventListener("click", () => {
      div.querySelector(".h-details").classList.toggle("hidden");
    });
    daysWrap.appendChild(div);
  }
}

/* Render: History summary (optional inline) */
function renderHistorySummary(data) {
  // Example: last hourly entry temp/wind/precip
  const last = data?.timelines?.hourly?.slice(-1)[0]?.values || null;
  if (!last) return;
  // You can add a subtle note under the hero card if desired.
  // For now, no-op to avoid clutter.
}

/* Map helpers */
function addCenterMarker(lat, lon) {
  if (!map) return;
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

/* Radar tiles — Tomorrow.io Weather Maps API
   We fetch a list of timestamps (past + future) and animate a raster layer.
*/
async function loadRadarFrames(lat, lon) {
  // Simple approach: fetch timestamps for precipitationIntensity.
  // Tomorrow.io provides map tiles for the last 24h and forecast; we’ll generate a timeline near "now".
  // Here we synthesize timestamps around now; replace with official timestamps if exposed to your plan.
  const now = Date.now();
  // Build +/- frames: past 60min every 10min plus next 30min every 10min
  const frames = [];
  for (let i = 6; i >= 0; i--) frames.push(Math.floor((now - i * 10 * 60 * 1000) / 1000)); // past
  for (let i = 1; i <= 3; i++) frames.push(Math.floor((now + i * 10 * 60 * 1000) / 1000)); // near future
  radar.frames = frames;
  radar.idx = frames.length - 1; // start at latest
  addRadarLayer(frames[radar.idx]);
  startRadarLoop();
}

function radarTileUrl(timestamp) {
  // Tomorrow.io Weather Maps tile template:
  // https://api.tomorrow.io/v4/map/tile/{zoom}/{x}/{y}/precipitationIntensity/{timestamp}.png?apikey=KEY
  return `https://api.tomorrow.io/v4/map/tile/{z}/{x}/{y}/precipitationIntensity/${timestamp}.png?apikey=${TOMORROW_KEY}`;
}

function addRadarLayer(timestamp) {
  if (!map) return;
  const sourceId = "radar";
  const layerId = "radar-layer";
  const tiles = [radarTileUrl(timestamp)];
  if (map.getSource(sourceId)) {
    // Update tiles by recreating source (Mapbox doesn't let you mutate tiles array directly)
    try {
      map.removeLayer(layerId);
      map.removeSource(sourceId);
    } catch {}
  }
  map.addSource(sourceId, { type: "raster", tiles, tileSize: 256 });
  map.addLayer({
    id: layerId,
    type: "raster",
    source: sourceId,
    paint: { "raster-opacity": 0.7 }
  });
}

function startRadarLoop() {
  if (!map || radar.frames.length === 0) return;
  stopRadarLoop();
  radar.timer = setInterval(() => {
    radar.idx = (radar.idx + 1) % radar.frames.length;
    addRadarLayer(radar.frames[radar.idx]);
  }, radar.speedMs);
}
function stopRadarLoop() {
  if (radar.timer) {
    clearInterval(radar.timer);
    radar.timer = null;
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
  } catch {
    document.getElementById("water-status").textContent = "Error loading gauges.";
    showOffline("⚠️ River gauges unavailable");
  }
}

/* AmbientWeather station dots (optional; requires map) */
async function loadAmbientStations() {
  if (!map) return;
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
  } catch {
    showOffline("⚠️ AmbientWeather data unavailable");
  }
}

/* UI helpers */
function showCard(el) { el.classList.remove("hidden"); el.classList.add("show"); }
function showError(msg) {
  showCard(nowCard);
  document.getElementById("nowTemp").textContent = `--°`;
  document.getElementById("nowSummary").textContent = msg;
  document.getElementById("nowFeels").textContent = `Feels like --°`;
  document.getElementById("nowWind").textContent = `Wind —`;
  document.getElementById("nowHum").textContent = `Humidity —`;
}
function setUpdated(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = "Last updated: " + new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
}
function showOffline(msg) {
  offlineBanner.textContent = msg;
  offlineBanner.classList.remove("hidden");
}
function clearOffline() {
  offlineBanner.classList.add("hidden");
}

/* Formatting + conversions */
function formatTempFromUnits(val, apiUnits) {
  if (!Number.isFinite(val)) return "--°";
  // If Tomorrow.io returns metric (C) and UI wants F, convert.
  if (unitPrimary === "F" && apiUnits === "metric") {
    return `${Math.round((val * 9) / 5 + 32)}°`;
  }
  if (unitPrimary === "C" && apiUnits === "imperial") {
    return `${Math.round((val - 32) * 5 / 9)}°`;
  }
  return `${Math.round(val)}°`;
}
function safeRound(v) { return Number.isFinite(v) ? Math.round(v) : "—"; }
function safeFixed(v, n) { return Number.isFinite(v) ? v.toFixed(n) : "0.00"; }

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

/* Tomorrow.io weather code mapping */
function codeToSummary(code) {
  const map = {
    0: "Unknown",
    1000: "Clear",
    1100: "Mostly clear",
    1101: "Partly cloudy",
    1102: "Mostly cloudy",
    1001: "Cloudy",
    2000: "Fog",
    2100: "Light fog",
    4000: "Drizzle",
    4001: "Rain",
    4200: "Light rain",
    4201: "Heavy rain",
    5000: "Snow",
    5001: "Flurries",
    5100: "Light snow",
    5101: "Heavy snow",
    6000: "Freezing drizzle",
    6001: "Freezing rain",
    6200: "Light freezing rain",
    6201: "Heavy freezing rain",
    7000: "Ice pellets",
    7101: "Heavy ice pellets",
    7102: "Light ice pellets",
    8000: "Thunderstorm"
  };
  return map[code] ?? "—";
}
function codeToEmoji(code) {
  if ([1000,1100].includes(code)) return "☀️";
  if ([1101,1102,1001].includes(code)) return "☁️";
  if ([2000,2100].includes(code)) return "🌫️";
  if ([4000,4001,4200,4201].includes(code)) return "🌧️";
  if ([5000,5001,5100,5101].includes(code)) return "❄️";
  if ([6000,6001,6200,6201].includes(code)) return "🌨️";
  if ([7000,7101,7102].includes(code)) return "🧊";
  if ([8000].includes(code)) return "⛈️";
  return "🌡️";
}
function setIconTheme(code) {
  const sun = document.querySelector(".icon-sun");
  const cloud = document.querySelector(".icon-cloud");
  if (!sun || !cloud) return;
  sun.style.filter = ""; cloud.style.filter = "";

  if ([1000,1100].includes(code)) {
    sun.style.opacity = "1"; cloud.style.opacity = "0.15";
  } else if ([1101].includes(code)) {
    sun.style.opacity = "0.9"; cloud.style.opacity = "0.6";
  } else if ([1102,1001,2000,2100].includes(code)) {
    sun.style.opacity = "0.25"; cloud.style.opacity = "0.95";
  } else if ([4000,4001,4200,4201].includes(code)) {
    sun.style.opacity = "0.2"; cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 20px rgba(110,140,170,0.45))";
  } else if ([5000,5001,5100,5101,6000,6001,6200,6201].includes(code)) {
    sun.style.opacity = "0.2"; cloud.style.opacity = "1";
  } else if ([8000].includes(code)) {
    sun.style.opacity = "0.15"; cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 24px rgba(150,110,170,0.5))";
  }
}

/* Unit re-render */
function reRenderUnits() {
  // Flip API units to match UI selection for consistency
  unitsApi = unitPrimary === "F" ? "imperial" : "metric";
  if (lastLoc) {
    loadRealtime(lastLoc.lat, lastLoc.lon);
    loadForecast(lastLoc.lat, lastLoc.lon);
  }
}