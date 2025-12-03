// Storm Surge Weather — Mapbox + AmbientWeather + Tomorrow.io + USGS

const MAPBOX_TOKEN = window.SSW_MAPBOX_TOKEN;
const AMBIENT_API_KEY = window.SSW_AMBIENT_KEY;
const TOMORROW_KEY = window.SSW_TOMORROW_KEY;

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
const waterCard = document.getElementById("waterCard");

let unitPrimary = localStorage.getItem("ssw-unit") || "F";
let lastLoc = JSON.parse(localStorage.getItem("ssw-last-loc") || "null");
let refreshTimer = null;

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
    loadAmbientStations();
  }
});

/* Resolve ZIP or city to lat/lon */
async function resolveLocation(query) {
  try {
    let lat, lon;
    if (/^\d{5}$/.test(query)) {
      // ZIP lookup
      const res = await fetch(`https://api.zippopotam.us/us/${query}`);
      if (!res.ok) throw new Error("ZIP lookup failed");
      const data = await res.json();
      lat = parseFloat(data.places[0].latitude);
      lon = parseFloat(data.places[0].longitude);
    } else {
      // City lookup via Nominatim
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
    loadWater(lat, lon).catch(() => failures++),
    loadAmbientStations().catch(() => failures++)
  ]);

  showCard(nowCard);
  showCard(todayGrid);
  showCard(dailyGrid);
  showCard(waterCard);

  if (failures > 0) showOffline("⚠️ Some data sources unavailable at last refresh");
  else clearOffline();
}

/* Weather via Tomorrow.io */
async function loadWeather(lat, lon) {
  try {
    const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${TOMORROW_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Tomorrow.io fetch failed");
    const data = await res.json();

    renderNowTomorrow(data);
    renderHoursTomorrow(data);
    renderDailyTomorrow(data);

    setUpdated("updated-now");
    setUpdated("updated-today");
    setUpdated("updated-daily");
  } catch (e) {
    showOffline("⚠️ Weather data unavailable");
    showError("Failed to fetch forecast.");
  }
}

function renderNowTomorrow(data) {
  const c = data.timelines?.current?.[0]?.values || {};
  document.getElementById("nowTemp").textContent = `${Math.round(c.temperature)}°`;
  document.getElementById("nowFeels").textContent = `Feels like ${Math.round(c.temperatureApparent)}°`;
  document.getElementById("nowWind").textContent = `Wind ${Math.round(c.windSpeed)} mph`;
  document.getElementById("nowHum").textContent = `Humidity ${Math.round(c.humidity)}%`;
  document.getElementById("nowSummary").textContent = codeToSummary(c.weatherCode);
  setIconTheme(c.weatherCode);
}

function renderHoursTomorrow(data) {
  const hoursWrap = document.getElementById("hours");
  hoursWrap.innerHTML = "";
  const hours = data.timelines?.hourly?.slice(0,8) || [];
  for (const h of hours) {
    const t = new Date(h.time);
    const v = h.values;
    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${t.toLocaleTimeString([], {hour:"numeric"})}</div>
      <div class="h-temp">${Math.round(v.temperature)}°</div>
      <div class="h-meta">${codeToEmoji(v.weatherCode)} ${codeToSummary(v.weatherCode)}</div>
      <div class="h-meta">💨 ${Math.round(v.windSpeed)} mph • 💧 ${Math.round(v.humidity)}% • ☔ ${v.precipitationIntensity.toFixed(2)}"</div>
    `;
    hoursWrap.appendChild(div);
  }
}

function renderDailyTomorrow(data) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";
  const days = data.timelines?.daily?.slice(0,7) || [];
  for (const d of days) {
    const t = new Date(d.time);
    const v = d.values;
    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${t.toLocaleDateString([], {weekday:"short"})}</div>
      <div class="h-temp">${Math.round(v.temperatureMax)}° / ${Math.round(v.temperatureMin)}°</div>
      <div class="h-meta">${codeToEmoji(v.weatherCodeMax)} ${codeToSummary(v.weatherCodeMax)}</div>
    `;
    daysWrap.appendChild(div);
  }
}