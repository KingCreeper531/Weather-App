// Storm Surge Weather — NWS + RainViewer + USGS
// Features: auto-refresh, unit toggle, last ZIP memory, manual refresh, updated timestamps, offline indicator

const zipInput = document.getElementById("zip");
const goBtn = document.getElementById("goBtn");
const unitToggle = document.getElementById("unitToggle");
const refreshBtn = document.getElementById("refreshBtn");

const nowCard = document.getElementById("nowCard");
const todayGrid = document.getElementById("todayGrid");
const dailyGrid = document.getElementById("dailyGrid");
const alertsCard = document.getElementById("alertsCard");
const radarCard = document.getElementById("radarCard");
const waterCard = document.getElementById("waterCard");

let unitPrimary = localStorage.getItem("ssw-unit") || "F";
let lastZip = localStorage.getItem("ssw-last-zip") || null;
let lastLoc = null;
let refreshTimer = null;
let lastTemps = { f: null, c: null };

goBtn.addEventListener("click", () => {
  const zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    showError("Please enter a valid 5-digit US ZIP.");
    return;
  }
  getByZip(zip);
});

zipInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goBtn.click();
});

unitToggle.addEventListener("click", () => {
  unitPrimary = unitPrimary === "F" ? "C" : "F";
  localStorage.setItem("ssw-unit", unitPrimary);
  reRenderUnits();
});

refreshBtn.addEventListener("click", () => {
  if (lastLoc) loadAll(lastLoc.lat, lastLoc.lon);
});

window.addEventListener("DOMContentLoaded", () => {
  if (lastZip) {
    zipInput.value = lastZip;
    getByZip(lastZip);
  }
});

async function getByZip(zip) {
  try {
    const locRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!locRes.ok) throw new Error("Invalid ZIP or lookup failed.");
    const locData = await locRes.json();
    const lat = parseFloat(locData.places[0].latitude);
    const lon = parseFloat(locData.places[0].longitude);

    lastZip = zip;
    localStorage.setItem("ssw-last-zip", zip);
    lastLoc = { lat, lon, zip };

    await loadAll(lat, lon);
    setupAutoRefresh();
  } catch (err) {
    showError(err.message);
  }
}

function setupAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (!lastLoc) return;
    await loadAll(lastLoc.lat, lastLoc.lon);
  }, 10 * 60 * 1000);
}

async function loadAll(lat, lon) {
  let failures = 0;
  await Promise.allSettled([
    loadWeather(lat, lon).catch(() => failures++),
    loadAlerts(lat, lon).catch(() => failures++),
    loadRadar(lat, lon).catch(() => failures++),
    loadWater(lat, lon).catch(() => failures++)
  ]);

  showCard(nowCard);
  showCard(todayGrid);
  showCard(dailyGrid);
  showCard(alertsCard);
  showCard(radarCard);
  showCard(waterCard);

  if (failures > 0) {
    showOffline("⚠️ Some data sources unavailable at last refresh");
  } else {
    clearOffline();
  }
}

/* Weather via NWS */
async function loadWeather(lat, lon) {
  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    if (!pointsRes.ok) throw new Error("Failed to reach NWS points.");
    const points = await pointsRes.json();

    const forecastUrl = points?.properties?.forecast;
    const hourlyUrl = points?.properties?.forecastHourly;
    const stationsUrl = points?.properties?.observationStations;

    const fcRes = await fetch(forecastUrl);
    const forecast = await fcRes.json();
    const periods = forecast?.properties?.periods || [];

    let hourly = null;
    try {
      const hrRes = await fetch(hourlyUrl);
      if (hrRes.ok) hourly = await hrRes.json();
    } catch {}

    let obs = null;
    try {
      const stRes = await fetch(stationsUrl);
      const stations = await stRes.json();
      const stationId = stations?.features?.[0]?.properties?.stationIdentifier;
      if (stationId) {
        const obRes = await fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`);
        if (obRes.ok) obs = await obRes.json();
      }
    } catch {}

    renderNowNWS(obs, periods[0]);
    if (hourly?.properties?.periods) {
      renderHoursNWS(hourly.properties.periods);
    } else {
      renderHoursFromForecast(periods);
    }
    renderDailyNWS(periods);

    setUpdated("updated-now");
    setUpdated("updated-today");
    setUpdated("updated-daily");
  } catch {
    showOffline("⚠️ Weather data unavailable at last refresh");
  }
}

/* Alerts via NWS */
async function loadAlerts(lat, lon) {
  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    if (!pointsRes.ok) return;
    const points = await pointsRes.json();
    const zoneId = points?.properties?.forecastZone?.split("/").pop();
    if (!zoneId) return;

    const alRes = await fetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`);
    if (!alRes.ok) return;
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
  } catch {
    showOffline("⚠️ Alerts unavailable");
  }
}

/* Radar via RainViewer */
async function loadRadar(lat, lon) {
  const url = `https://www.rainviewer.com/weather-radar-map-live.html?x=${lon}&y=${lat}&z=7`;
  const iframe = document.getElementById("radar");
  iframe.src = url;
  const openBtn = document.getElementById("openRadar");
  openBtn.onclick = () => window.open(url, "_blank");
  setUpdated("updated-radar");
}

/* USGS water gauges */
async function loadWater(lat, lon) {
  try {
    const status = document.getElementById("water-status");
    status.textContent = "Finding nearby gauges…";
    const siteUrl = `https://waterservices.usgs.gov/nwis/site/?format=json&lat=${lat}&lon=${lon}&radius=40&siteType=ST&hasDataTypeCd=iv`;
    const siteRes = await fetch(siteUrl);
    const sitesJson = await siteRes.json();
    const siteArr = extractSitesFromJson(sitesJson);
    const topSites = siteArr.slice(0, 4);
    const gaugesEl = document.getElementById("gauges");
    gaugesEl.innerHTML = "";

    if (topSites.length === 0) {
      status.textContent = "No nearby river gauges found.";
      return;
    }

    status.textContent = `Showing ${topSites.length} nearby gauges`;
    for (const site of topSites) {
      const ivUrl = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00060,00065&siteStatus=active`;
      const ivRes = await fetch(ivUrl);
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

/* USGS helpers */
function extractSitesFromJson(json) {
  const arr = json?.value?.site ?? [];
  return arr.map(s => s?.siteCode?.[0]?.value).filter(Boolean);
}

function parseUSGSInstant(json) {
  const ts = json?.value?.timeSeries ?? [];
  let name = null, flow = null, stage = null, trend = null;

  if (ts[0]?.sourceInfo?.siteName) {
    name = ts[0].sourceInfo.siteName;
  }

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

/* Unit re-render */
function reRenderUnits() {
  const shownTemp = unitPrimary === "F" ? lastTemps.f : lastTemps.c;
  document.getElementById("nowTemp").textContent = shownTemp != null ? `${Math.round(shownTemp)}°` : `--°`;
  if (lastLoc) loadWeather(lastLoc.lat, lastLoc.lon);
}

/* UI helpers */
function showCard(el) {
  el.classList.remove("hidden");
  el.classList.add("show");
}

function showError(msg) {
  showCard(nowCard);
  document.getElementById("nowTemp").textContent = `--°`;
  document.getElementById("nowSummary").textContent = msg;
  document.getElementById("nowFeels").textContent = `Feels like --°`;
  document.getElementById("nowWind").textContent = `Wind -- mph`;
  document.getElementById("nowHum").textContent = `Humidity --%`;
}

/* Offline + updated banner helpers */
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

/* Summary → code mapping */
function summaryToCode(summary) {
  if (!summary) return 0;
  const s = summary.toLowerCase();
  if (s.includes("thunder")) return 95;
  if (s.includes("snow")) return 71;
  if (s.includes("rain") || s.includes("showers") || s.includes("drizzle")) return 61;
  if (s.includes("fog")) return 45;
  if (s.includes("overcast")) return 3;
  if (s.includes("cloud")) return 2;
  return 1;
}

function codeToEmoji(code) {
  if ([0,1].includes(code)) return "☀️";
  if ([2].includes(code)) return "🌤️";
  if ([3,45].includes(code)) return "☁️";
  if ([61,63,65,80,81,82].includes(code)) return "🌧️";
  if ([71,73,75].includes(code)) return "❄️";
  if ([95,96,99].includes(code)) return "⛈️";
  return "🌡️";
}

function setIconTheme(code) {
  const sun = document.querySelector(".icon-sun");
  const cloud = document.querySelector(".icon-cloud");
  if (!sun || !cloud) return;
  sun.style.filter = "";
  cloud.style.filter = "";

  if ([0,1].includes(code)) {
    sun.style.opacity = "1"; cloud.style.opacity = "0.15";
  } else if ([2].includes(code)) {
    sun.style.opacity = "0.9"; cloud.style.opacity = "0.6";
  } else if ([3,45].includes(code)) {
    sun.style.opacity = "0.25"; cloud.style.opacity = "0.95";
  } else if ([61,63,65,80,81,82].includes(code)) {
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
function msToMph(ms) { return ms * 2.23694; }