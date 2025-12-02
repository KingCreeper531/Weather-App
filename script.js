// Storm Surge Weather — Open‑Meteo (weather) + NOAA Water (NWPS) for water data
// No default location: user must enter a city or ZIP, then we fetch data.

const searchInput = document.getElementById("search");
const goBtn = document.getElementById("goBtn");
const locNameEl = document.getElementById("locName");
const radarFrame = document.getElementById("radarFrame");

const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

const nowCard = document.getElementById("nowCard");
const hourlyCard = document.getElementById("hourlyCard");
const dailyCard = document.getElementById("dailyCard");
const radarCard = document.getElementById("radarCard");

// Init: attach events only
attachEvents();

function attachEvents() {
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

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      tabContents.forEach(c => {
        c.classList.toggle("hidden", c.id !== `${target}Tab`);
      });
    });
  });
}

// Location resolution (Open‑Meteo geocoding)
async function resolveLocation(query) {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query);
    url.searchParams.set("count", 1);
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Location search failed.");
    const geo = await res.json();

    if (!geo.results || geo.results.length === 0) {
      showError("Location not found. Try a city or ZIP.");
      return;
    }

    const place = geo.results[0];
    const lat = place.latitude;
    const lon = place.longitude;
    const label = place.name + (place.admin1 ? `, ${place.admin1}` : "");
    await loadByCoords(lat, lon, label);
  } catch (err) {
    showError(err.message || "Location error.");
  }
}

// Main loader (Open‑Meteo forecast)
async function loadByCoords(lat, lon, label) {
  try {
    locNameEl.textContent = label;

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,wind_speed_10m,apparent_temperature,precipitation,weather_code,is_day");
    url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,precipitation_probability,weather_code");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,snowfall_sum,snow_depth");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Forecast fetch failed.");
    const data = await res.json();

    renderNow(data);
    renderHourly(data);
    renderDaily(data);
    renderSnow(data);

    setTheme(data);
    setRadar(lat, lon);

    // Load NOAA water data after weather is set
    loadWaterData(lat, lon, label);

    [nowCard, hourlyCard, dailyCard, radarCard].forEach(showCard);
  } catch (err) {
    showError("Failed to fetch forecast.");
  }
}

// NOAA Water (NWPS) — basic fetch with fallback
// NOTE: NWPS has multiple ArcGIS layers; for a simple client-side app,
// we show a generic message and provide a link scoped near the searched location.
async function loadWaterData(lat, lon, label) {
  const waterMeta = document.getElementById("waterMeta");
  try {
    // Example ArcGIS service ping to confirm availability (no key)
    const pingUrl = "https://maps.water.noaa.gov/server/rest/services/nwm/streamflow/MapServer?f=json";
    const res = await fetch(pingUrl);
    if (!res.ok) throw new Error("NOAA water service unavailable.");

    // Provide a helpful link for local water details near the searched location
    const nearbyLink = `https://water.noaa.gov/?lat=${lat}&lon=${lon}&zoom=9`;
    waterMeta.innerHTML = `
      🌊 NOAA Water service is available.<br>
      🔗 View detailed local streamflow and flood info: <a href="${nearbyLink}" target="_blank" rel="noopener">NOAA Water (near ${label})</a><br>
      ℹ️ Integrating per‑gauge data requires querying specific map layers; this app keeps it lightweight and client‑side.
    `;
  } catch (err) {
    waterMeta.textContent = "Water data unavailable from NOAA at the moment.";
  }
}

// Current conditions
function renderNow(data) {
  const c = data.current;
  const temp = round(c.temperature_2m);
  const feels = round(c.apparent_temperature);
  const wind = round(c.wind_speed_10m);
  const hum = round(c.relative_humidity_2m);

  setText("nowTemp", `${temp}°`);
  setText("nowFeels", `Feels like ${feels}°`);
  setText("nowWind", `Wind ${wind} mph`);
  setText("nowHum", `Humidity ${hum}%`);
  setText("nowSummary", codeToSummary(c.weather_code));

  setIconTheme(c.weather_code, c.is_day === 1);
}

// Hourly (next 12 hours)
function renderHourly(data) {
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const winds = data.hourly.wind_speed_10m;
  const hums = data.hourly.relative_humidity_2m;
  const precs = data.hourly.precipitation;
  const pops = data.hourly.precipitation_probability;
  const codes = data.hourly.weather_code;

  const nowISO = data.current.time;
  let nowIdx = times.indexOf(nowISO);
  if (nowIdx < 0) {
    const now = new Date(nowISO || Date.now());
    nowIdx = times.findIndex(t => new Date(t) >= now);
    if (nowIdx < 0) nowIdx = 0;
  }

  const hoursWrap = document.getElementById("hours");
  hoursWrap.innerHTML = "";
  const sliceEnd = Math.min(nowIdx + 12, times.length);

  for (let i = nowIdx; i < sliceEnd; i++) {
    const t = new Date(times[i]);
    const h = t.toLocaleTimeString([], { hour: "numeric" });
    const temp = round(temps[i]);
    const wind = round(winds[i]);
    const hum = round(hums[i]);
    const prec = formatInches(precs[i]);
    const pop = pops?.[i] ?? "—";
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${h}</div>
      <div class="h-temp">${temp}°</div>
      <div class="h-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
      <div class="h-meta">💨 ${wind} mph • 💧 ${hum}% • ☔ ${prec} • 📈 ${pop}%</div>
    `;
    hoursWrap.appendChild(div);
  }
}

// Daily (10‑day)
function renderDaily(data) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";

  const dates = data.daily.time;
  const tmax = data.daily.temperature_2m_max;
  const tmin = data.daily.temperature_2m_min;
  const precip = data.daily.precipitation_sum;
  const popMax = data.daily.precipitation_probability_max;
  const codes = data.daily.weather_code;

  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]);
    const label = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const hi = round(tmax[i]);
    const lo = round(tmin[i]);
    const rain = formatInches(precip[i]);
    const pop = popMax?.[i] ?? "—";
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `
      <div class="d-date">${label}</div>
      <div class="d-temp">${hi}° / ${lo}°</div>
      <div class="d-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
      <div class="d-meta">☔ ${rain} • 📈 ${pop}%</div>
    `;
    daysWrap.appendChild(div);
  }
}

// Snow tab (uses Open‑Meteo daily snowfall and depth)
function renderSnow(data) {
  const daily = data.daily;
  const snowDepth = formatInches(daily.snow_depth?.[0]);
  const snowfall = formatInches(daily.snowfall_sum?.[0]);
  const minTemp = round(daily.temperature_2m_min?.[0]);
  const wind = round(data.current.wind_speed_10m);

  const html = `
    ❄️ Snowfall today: ${snowfall}<br>
    🧊 Snow depth: ${snowDepth}<br>
    🌡️ Low temp: ${minTemp}°<br>
    💨 Wind: ${wind} mph
  `;
  document.getElementById("snowMeta").innerHTML = html;
}

// Theming based on current weather and day/night
function setTheme(data) {
  const code = data.current.weather_code;
  const isDay = data.current.is_day === 1;

  let accent = "#5dd2ff";
  let surface = "#101722";
  let shadow = "rgba(0,0,0,0.35)";

  if ([0,1].includes(code) && isDay) { accent = "#ffd166"; surface = "#111a24"; }
  else if ([2].includes(code)) { accent = "#9bd7ff"; surface = "#101a23"; }
  else if ([3,45,48].includes(code)) { accent = "#8fb0cc"; surface = "#0f1822"; }
  else if ([51,53,55,61,63,65,80,81,82].includes(code)) { accent = "#64a8ff"; surface = "#0e1721"; }
  else if ([71,73,75].includes(code)) { accent = "#bfe3ff"; surface = "#0e1720"; }
  else if ([95,96,99].includes(code)) { accent = "#c57bff"; surface = "#0e1520"; }

  if (!isDay) { accent = shade(accent, -10); shadow = "rgba(0,0,0,0.45)"; }

  setCSS("--theme-accent", accent);
  setCSS("--theme-surface", surface);
  setCSS("--theme-shadow", shadow);
}

// Radar under Weather
function setRadar(lat, lon) {
  const url = `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&layer=radar&overlay=0&zoom=7&do=radar;`;
  radarFrame.src = url;
}

// Icon emphasis
function setIconTheme(code, isDay) {
  const sun = document.querySelector(".icon-sun");
  const cloud = document.querySelector(".icon-cloud");
  if (!sun || !cloud) return;

  const sunBase = isDay ? 1 : 0.3;

  if ([0,1].includes(code)) { sun.style.opacity = String(sunBase); cloud.style.opacity = "0.15"; }
  else if ([2].includes(code)) { sun.style.opacity = String(Math.max(0.6, sunBase * 0.8)); cloud.style.opacity = "0.6"; }
  else if ([3,45,48].includes(code)) { sun.style.opacity = "0.2"; cloud.style.opacity = "0.95"; }
  else if ([51,53,55,61,63,65,80,81,82].includes(code)) { sun.style.opacity = "0.18"; cloud.style.opacity = "1"; }
  else if ([71,73,75].includes(code)) { sun.style.opacity = "0.18"; cloud.style.opacity = "1"; }
  else if ([95,96,99].includes(code)) { sun.style.opacity = "0.15"; cloud.style.opacity = "1"; }
}

// Utilities
function showCard(el) { el.classList.remove("hidden"); el.classList.add("show"); }
function showError(msg) {
  showCard(nowCard);
  setText("nowTemp", `--°`);
  setText("nowSummary", msg);
  setText("nowFeels", `Feels like --°`);
  setText("nowWind", `Wind -- mph`);
  setText("nowHum", `Humidity --%`);
}
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setCSS(varName, value) { document.documentElement.style.setProperty(varName, value); }
function round(x) { return Math.round(Number(x ?? 0)); }
function formatInches(x) {
  const v = Number(x ?? 0);
  return `${v.toFixed(2)}"`;
}
// Shade hex color by percentage (-100..100)
function shade(hex, percent) {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0,2), 16);
    const g = parseInt(h.substring(2,4), 16);
    const b = parseInt(h.substring(4,6), 16);
    const p = percent / 100;
    const nr = clamp(Math.round(r + (255 - r) * p), 0, 255);
    const ng = clamp(Math.round(g + (255 - g) * p), 0, 255);
    const nb = clamp(Math.round(b + (255 - b) * p), 0, 255);
    return `#${nr.toString(16).padStart(2,"0")}${ng.toString(16).padStart(2,"0")}${nb.toString(16).padStart(2,"0")}`;
  } catch { return hex; }
}
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }