// Tab switching
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

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

// Water tab data
function renderWater(data) {
  const hum = Math.round(data.current.relative_humidity_2m);
  const prec = Number(data.current.precipitation || 0).toFixed(2);
  const feels = Math.round(data.current.apparent_temperature);
  const wind = Math.round(data.current.wind_speed_10m);

  const html = `
    💧 Humidity: ${hum}%<br>
    ☔ Precipitation: ${prec}"<br>
    💨 Wind: ${wind} mph<br>
    🧊 Feels like: ${feels}°
  `;
  document.getElementById("waterMeta").innerHTML = html;
}

// Snow tab data
function renderSnow(data) {
  const daily = data.daily;
  const snowDepth = daily.snow_depth?.[0] ?? "—";
  const snowfall = daily.snowfall?.[0] ?? "—";
  const minTemp = Math.round(daily.temperature_2m_min?.[0] ?? 0);
  const wind = Math.round(data.current.wind_speed_10m);

  const html = `
    ❄️ Snowfall today: ${snowfall}"<br>
    🧊 Snow depth: ${snowDepth}"<br>
    🌡️ Low temp: ${minTemp}°<br>
    💨 Wind: ${wind} mph
  `;
  document.getElementById("snowMeta").innerHTML = html;
}

// Update loadWeather to call these
async function loadWeather(lat, lon, label) {
  locNameEl.textContent = label;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "is_day"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "precipitation",
    "weather_code"
  ].join(","));
  url.searchParams.set("daily", [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "weather_code",
    "snowfall",
    "snow_depth"
  ].join(","));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch forecast.");
  const data = await res.json();

  renderNow(data);
  renderHourly(data);
  renderDaily(data);
  renderWater(data);
  renderSnow(data);
  setTheme(data);
  setRadar(lat, lon);

  showCard(nowCard);
  showCard(hourlyCard);
  showCard(dailyCard);
  showCard(radarCard);
}