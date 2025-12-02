// Storm Surge Weather — JS without theme toggle

const UA = "StormSurgeWeather (github.com/stormsurge-weather; contact: stormsurgee025@gmail.com)";

const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("search-input"),
  title: document.getElementById("location-title"),
  updatedAt: document.getElementById("updated-at"),
  tempF: document.getElementById("temp-f"),
  tempC: document.getElementById("temp-c"),
  status: document.getElementById("status"),
  windHumidity: document.getElementById("wind-humidity"),
  today: document.getElementById("today-glance"),
  forecast: document.getElementById("forecast"),
  radar: document.getElementById("radar"),
  openRainviewer: document.getElementById("open-rainviewer"),
  waterStatus: document.getElementById("water-status"),
  gauges: document.getElementById("gauges"),
  alerts: document.getElementById("alerts"),
  unitToggle: document.getElementById("unit-toggle"),
  openWater: document.getElementById("open-water"),
};

let unitPrimary = localStorage.getItem("ssw-unit") || "F";
let lastTemps = { f: null, c: null };
let lastLoc = { lat: null, lon: null, name: null };

// Unit toggle
el.unitToggle.addEventListener("click", () => {
  unitPrimary = unitPrimary === "F" ? "C" : "F";
  localStorage.setItem("ssw-unit", unitPrimary);
  renderTemps(lastTemps.f, lastTemps.c);
});

// Search
el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = (el.input.value || "").trim();
  if (!q) return;
  resetUI();
  try {
    const { lat, lon, location } = await geocode(q);
    lastLoc = { lat, lon, name: location };
    el.title.textContent = location;
    el.updatedAt.textContent = "Loading...";
    await loadWeather(lat, lon);
    await loadAlerts(lat, lon);
    loadRadar(lat, lon);
    await loadWater(lat, lon);
    el.status.textContent = "Updated";
    el.updatedAt.textContent = new Date().toLocaleString();
  } catch (err) {
    console.error(err);
    el.title.textContent = "Location not found";
    el.status.textContent = "Error loading data";
    el.updatedAt.textContent = "—";
  }
});

// NOAA Water button
el.openWater.addEventListener("click", () => {
  window.open("https://water.noaa.gov/", "_blank");
});

// Reset UI
function resetUI() {
  el.status.textContent = "Fetching data...";
  el.windHumidity.textContent = "—";
  el.today.innerHTML = "";
  el.forecast.innerHTML = "";
  el.alerts.innerHTML = "";
  el.waterStatus.textContent = "Loading...";
  el.gauges.innerHTML = "";
  el.tempF.textContent = "--°F";
  el.tempC.textContent = "--°C";
}

// Geocode via Nominatim
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const data = await res.json();
  if (!data?.[0]) throw new Error("No geocode result");
  const top = data[0];
  const lat = parseFloat(top.lat), lon = parseFloat(top.lon);
  const location = top.display_name.split(",").slice(0,3).join(", ");
  return { lat, lon, location };
}

// Weather.gov
async function loadWeather(lat, lon) {
  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { "User-Agent": UA, "Accept": "application/geo+json" }
  });
  if (!pointsRes.ok) throw new Error("points fetch failed");
  const points = await pointsRes.json();
  const forecastUrl = points?.properties?.forecast;
  const stationsUrl = points?.properties?.observationStations;

  const fcRes = await fetch(forecastUrl, { headers: { "User-Agent": UA } });
  const forecast = await fcRes.json();
  const periods = forecast?.properties?.periods || [];
  renderToday(periods[0]);
  renderForecast(periods.slice(0, 14));

  // Observations
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
  } catch {}

  // Temps
  let tempC = obs?.properties?.temperature?.value ?? null;
  let tempF = null;
  if (typeof tempC === "number") {
    tempF = cToF(tempC);
  } else if (periods[0]) {
    const p0 = periods[0];
    if ((p0.temperatureUnit || "").toUpperCase() === "F") {
      tempF = p0.temperature;
      tempC = fToC(tempF);
    } else {
      tempC = p0.temperature;
      tempF = cToF(tempC);
    }
  }
  lastTemps = { f: tempF, c: tempC };
  renderTemps(tempF, tempC);

  // Wind/Humidity
  const windMs = obs?.properties?.windSpeed?.value;
  const humPct = obs?.properties?.relativeHumidity?.value;
  const windStr = windMs != null ? `${msToMph(windMs).toFixed(0)} mph` : "--";
  const humStr = humPct != null ? `${Math.round(humPct)}%` : "--";
  el.windHumidity.textContent = `Wind ${windStr} • Humidity ${humStr}`;
}

// Alerts
async function loadAlerts(lat, lon) {
  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { "User-Agent": UA }
    });
    if (!pointsRes.ok) return;
    const points = await pointsRes.json();
    const zoneId = points?.properties?.forecastZone?.split("/").pop();
    if (!zoneId) return;
    const alRes = await fetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`, {
      headers: { "User-Agent": UA }
    });
    if (!alRes.ok) return;
    const alerts = await alRes.json();
    const features = alerts?.features || [];
    el.alerts.innerHTML = features.slice(0, 4).map(a => {
      const p = a.properties || {};
      const title = p.event || "Alert";
      const severity = p.severity || "—";
      const area = (p.areaDesc || "").split(";").slice(0,1).join("");
      return `<div class="alert-banner"><strong>${title}</strong> — ${severity}${area ? ` • ${area}` : ""}</div>`;
    }).join("");
  } catch {
    el.alerts.innerHTML = "";
  }
}

// Radar
function loadRadar(lat, lon) {
  const url = `https://www.rainviewer.com/weather-radar-map-live.html?x=${lon}&y=${lat}&z=7`;
  el.radar.src = url;
  el.openRainviewer.onclick = () => window.open(url, "_blank");
}

// Water (USGS gauges)
async function loadWater(lat, lon) {
  try {
    el.waterStatus.textContent = "Finding nearby gauges…";
    const siteUrl = `https://waterservices.usgs.gov/nwis/site/?format=json&lat=${lat}&lon=${lon}&radius=40&siteType=ST&hasDataTypeCd=iv`;
    const siteRes = await fetch(siteUrl, { headers: { "User-Agent": UA } });
    const sites = await siteRes.json();
    const siteArr = extractSitesFromJson(sites);
    const topSites = siteArr.slice(0, 4);
    if (topSites.length === 0) {
      el.waterStatus.textContent = "No nearby river gauges found.";
      return;
    }
    el.waterStatus.textContent = `Showing ${topSites.length} nearby gauges`;
    el.gauges.innerHTML = "";
    for (const site of topSites) {
      const ivUrl = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00060,00065&siteStatus=active`;
      const ivRes = await fetch(ivUrl, { headers: { "User-Agent": UA } });
      const iv = await ivRes.json();
      const { name, flow, stage, trend } = parseUSGSInstant(iv);
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
      el.gauges.appendChild(card);
    }
  } catch (e) {
    console.error(e);
    el.waterStatus.textContent = "Error loading gauges";
  }
}

// USGS helpers
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

// Rendering
function renderToday(p) {
  if (!p) {
    el.today.innerHTML = `<div class="forecast-day">No forecast data available.</div>`;
    return;
  }
  el.today.innerHTML = `
    <div class="forecast-day">
      <div class="row">
        <span><strong>${p.name}</strong></span>
        <span>${p.temperature}°${p.temperatureUnit}</span>
      </div>
      <div>${p.shortForecast}</div>
      <div class="desc">${p.detailedForecast}</div>
    </div>
  `;
}

function renderForecast(periods) {
  el.forecast.innerHTML = periods.slice(0, 14).map(d => `
    <div class="forecast-day">
      <div class="row">
        <span class="day"><strong>${d.name}</strong></span>
        <span class="temp">${d.temperature}°${d.temperatureUnit}</span>
      </div>
      <div class="desc">${d.shortForecast}</div>
    </div>
  `).join("");
}

function renderTemps(f, c) {
  const showF = unitPrimary === "F";
  el.tempF.textContent = f != null ? `${Math.round(f)}°F` : `--°F`;
  el.tempC.textContent = c != null ? `${Math.round(c)}°C` : `--°C`;
  el.tempF.style.opacity = showF ? "1" : ".55";
  el.tempC.style.opacity = showF ? ".55" : "1";
}

// Utils
function cToF(c) { return (c * 9) / 5 + 32; }
function fToC(f) { return (f - 32) * 5 / 9; }
function msToMph(ms) { return ms * 2.23694; }