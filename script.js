async function getWeather() {
  const zip = document.getElementById("zip").value;
  if (!zip) {
    alert("Please enter a ZIP code");
    return;
  }

  try {
    // Step 1: Get coordinates from ZIP
    const locRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!locRes.ok) throw new Error("Invalid ZIP code");
    const locData = await locRes.json();
    const lat = locData.places[0].latitude;
    const lon = locData.places[0].longitude;

    // Step 2: Get NWS gridpoint
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { "User-Agent": "WeatherApp (your-email@example.com)" }
    });
    const pointData = await pointRes.json();
    const forecastUrl = pointData.properties.forecast;

    // Step 3: Get forecast
    const forecastRes = await fetch(forecastUrl, {
      headers: { "User-Agent": "WeatherApp (your-email@example.com)" }
    });
    const forecastData = await forecastRes.json();

    // Step 4: Display first few periods
    const periods = forecastData.properties.periods.slice(0, 4); // today + next few
    let html = "";
    periods.forEach(p => {
      html += `<h3>${p.name}</h3><p>${p.detailedForecast}</p>`;
    });

    document.getElementById("weather").innerHTML = html;

  } catch (err) {
    document.getElementById("weather").innerHTML = `<p>Error: ${err.message}</p>`;
  }
}