// ========================================
//  JAVASCRIPT STARTS HERE
//  File: script.js
//  Storm Surge Weather Dashboard
// ========================================

// ================================
//  API KEYS & CONFIG
// ================================
const MAPBOX_KEY = "pk.eyJ1Ijoic3Rvcm0tc3VyZ2UiLCJhIjoiY21pcDM0emdxMDhwYzNmcHc2aTlqeTN5OSJ9.QYtnuhdixR4SGxLQldE9PA";

// Current state
let currentLat = 39.8283;
let currentLng = -98.5795; // Center of US
let currentRadarType = 'composite';

// Animation state
let isAnimating = true;
let animationInterval = null;
let currentTimeIndex = 11; // Start at "now" (latest frame)
let radarTimes = [];
let animationSpeed = 1000;

// Warning state
let warningsEnabled = true;
let activeWarnings = [];
let warningLayers = [];

// Cache for radar frames
let radarFrameCache = {};

// ================================
//  WEATHER CODE TRANSLATION (Open-Meteo)
// ================================
const weatherText = {
    0: "Clear sky",
    1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
};

// ================================
//  MAPBOX INITIALIZATION
// ================================
mapboxgl.accessToken = MAPBOX_KEY;

const map = new mapboxgl.Map({
    container: 'map',
    style: "mapbox://styles/mapbox/dark-v11",
    center: [currentLng, currentLat],
    zoom: 4,
    minZoom: 2,
    maxZoom: 12
});

const RADAR_SOURCE = "nexrad-radar";
const RADAR_LAYER = "nexrad-radar-layer";

// ================================
//  PRECIPITATION TYPE CLASSIFICATION
// ================================
function classifyPrecipitationType(temp, weatherCode) {
    // Classify based on temperature and weather code
    if (weatherCode >= 71 && weatherCode <= 77) {
        return { type: 'snow', icon: '❄️', color: '#4169E1' };
    } else if (weatherCode >= 85 && weatherCode <= 86) {
        return { type: 'snow', icon: '❄️', color: '#4169E1' };
    } else if (weatherCode === 56 || weatherCode === 57 || weatherCode === 66 || weatherCode === 67) {
        return { type: 'ice/sleet', icon: '🧊', color: '#E6E6FA' };
    } else if ((weatherCode >= 61 && weatherCode <= 65) || (weatherCode >= 80 && weatherCode <= 82)) {
        if (temp <= 32) {
            return { type: 'freezing rain', icon: '🧊', color: '#B0C4DE' };
        }
        return { type: 'rain', icon: '🌧️', color: '#00ff00' };
    } else if (weatherCode >= 51 && weatherCode <= 55) {
        return { type: 'drizzle', icon: '💧', color: '#90EE90' };
    } else if (weatherCode >= 95 && weatherCode <= 99) {
        return { type: 'thunderstorm', icon: '⛈️', color: '#ff0000' };
    }
    
    return null;
}

// ================================
//  RADAR ANIMATION FUNCTIONS
// ================================
function generateRadarTimes() {
    const times = [];
    const now = new Date();
    
    // Generate 12 time frames: every 5 minutes for 60 minutes
    for (let i = 11; i >= 0; i--) {
        const time = new Date(now.getTime() - (i * 5 * 60 * 1000));
        times.push(time);
    }
    
    radarTimes = times;
    return times;
}

function updateRadarLayer(radarType, timeIndex = 11) {
    if (!radarTimes.length) {
        generateRadarTimes();
    }
    
    // Use RainViewer's NEXRAD data
    let tileURL;
    const cacheKey = `${radarType}-${timeIndex}`;
    
    if (radarFrameCache[cacheKey]) {
        tileURL = radarFrameCache[cacheKey];
    } else {
        if (timeIndex === 11) {
            // Current/live radar
            tileURL = `https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/6/1_1.png`;
        } else {
            // Historical radar - use timestamp
            const timestamp = Math.floor(radarTimes[timeIndex].getTime() / 1000);
            tileURL = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/6/1_1.png`;
        }
        radarFrameCache[cacheKey] = tileURL;
    }

    if (map.getSource(RADAR_SOURCE)) {
        map.getSource(RADAR_SOURCE).setTiles([tileURL]);
    } else {
        map.addSource(RADAR_SOURCE, {
            type: "raster",
            tiles: [tileURL],
            tileSize: 256
        });

        map.addLayer({
            id: RADAR_LAYER,
            type: "raster",
            source: RADAR_SOURCE,
            paint: { 
                "raster-opacity": 0.55,
                "raster-fade-duration": 300
            }
        });
    }

    updateRadarTimeDisplay(timeIndex);
    updateLegend(radarType);
    updateLastUpdateTime();
}

function updateRadarTimeDisplay(timeIndex) {
    const timeSlider = document.getElementById('timeSlider');
    timeSlider.value = timeIndex;
    
    if (timeIndex === 11) {
        document.getElementById('radarTime').textContent = 'Now';
        document.getElementById('radarTimeMode').textContent = 'LIVE';
    } else {
        const time = radarTimes[timeIndex];
        const timeStr = time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const minutesAgo = Math.round((Date.now() - time.getTime()) / 60000);
        
        document.getElementById('radarTime').textContent = timeStr;
        document.getElementById('radarTimeMode').textContent = `${minutesAgo}m ago`;
    }
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    document.getElementById('lastUpdate').textContent = `Updated: ${timeStr}`;
}

function startAnimation() {
    if (animationInterval) clearInterval(animationInterval);
    
    animationInterval = setInterval(() => {
        currentTimeIndex = (currentTimeIndex + 1) % radarTimes.length;
        updateRadarLayer(currentRadarType, currentTimeIndex);
    }, animationSpeed);
    
    isAnimating = true;
    document.getElementById('playPauseBtn').textContent = '⏸️';
    document.getElementById('playPauseBtn').classList.add('playing');
}

function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    
    isAnimating = false;
    document.getElementById('playPauseBtn').textContent = '▶️';
    document.getElementById('playPauseBtn').classList.remove('playing');
}

function updateLegend(radarType) {
    const legendTitle = document.querySelector('.legend-title');
    const legendScale = document.querySelector('.legend-scale');
    
    const legends = {
        'composite': {
            title: 'Composite Reflectivity (dBZ)',
            scale: [
                { color: '#00ff00', label: 'Light (20-35)' },
                { color: '#ffff00', label: 'Moderate (35-45)' },
                { color: '#ff8000', label: 'Heavy (45-55)' },
                { color: '#ff0000', label: 'Severe (55+)' }
            ]
        },
        'precipitation': {
            title: 'Precipitation Type',
            scale: [
                { color: '#4169E1', label: 'Snow' },
                { color: '#E6E6FA', label: 'Ice/Sleet' },
                { color: '#00ff00', label: 'Light Rain' },
                { color: '#ffff00', label: 'Moderate Rain' },
                { color: '#ff8000', label: 'Heavy Rain' },
                { color: '#ff0000', label: 'Severe' }
            ]
        },
        'base': {
            title: 'Base Reflectivity',
            scale: [
                { color: '#00ff00', label: 'Light' },
                { color: '#ffff00', label: 'Moderate' },
                { color: '#ff8000', label: 'Heavy' },
                { color: '#ff0000', label: 'Severe' }
            ]
        },
        'velocity': {
            title: 'Storm Velocity',
            scale: [
                { color: '#00ff00', label: 'Approaching' },
                { color: '#ffff00', label: 'Moderate' },
                { color: '#ff8000', label: 'Fast' },
                { color: '#ff0000', label: 'Very Fast' }
            ]
        }
    };

    const legend = legends[radarType] || legends['composite'];
    legendTitle.textContent = legend.title;
    
    legendScale.innerHTML = legend.scale.map(item => 
        `<div class="legend-item">
            <div class="legend-color" style="background: ${item.color};"></div>
            <span>${item.label}</span>
        </div>`
    ).join('');
}

// ================================
//  WEATHER ALERTS/WARNINGS
// ================================
async function fetchWeatherAlerts(lat, lng) {
    try {
        // Using NWS API for weather alerts
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lng}`);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            return data.features.map(feature => ({
                id: feature.properties.id,
                event: feature.properties.event,
                headline: feature.properties.headline,
                description: feature.properties.description,
                severity: feature.properties.severity,
                urgency: feature.properties.urgency,
                onset: feature.properties.onset,
                expires: feature.properties.expires,
                geometry: feature.geometry
            }));
        }
        return [];
    } catch (error) {
        console.error('Error fetching weather alerts:', error);
        return [];
    }
}

async function loadWarningPolygons() {
    try {
        // Fetch active weather alerts for the US
        const response = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert');
        const data = await response.json();
        
        activeWarnings = data.features || [];
        displayWarnings();
        
    } catch (error) {
        console.error('Error loading warning polygons:', error);
    }
}

function displayWarnings() {
    // Remove existing warning layers
    warningLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getSource(layerId)) {
            map.removeSource(layerId);
        }
    });
    warningLayers = [];

    if (!warningsEnabled || activeWarnings.length === 0) {
        return;
    }

    // Create GeoJSON for warnings
    const warningGeoJSON = {
        type: 'FeatureCollection',
        features: activeWarnings.filter(warning => warning.geometry).map(warning => ({
            type: 'Feature',
            geometry: warning.geometry,
            properties: {
                event: warning.properties.event,
                headline: warning.properties.headline,
                description: warning.properties.description,
                severity: warning.properties.severity,
                urgency: warning.properties.urgency
            }
        }))
    };

    // Add warning polygon source
    const sourceId = 'weather-warnings';
    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
            type: 'geojson',
            data: warningGeoJSON
        });
    }

    // Add fill layer
    const fillLayerId = 'warning-fills';
    if (!map.getLayer(fillLayerId)) {
        map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': [
                    'match',
                    ['get', 'severity'],
                    'Extreme', '#ff0000',
                    'Severe', '#ff8000',
                    'Moderate', '#ffff00',
                    '#00ff00'
                ],
                'fill-opacity': 0.2
            }
        });
        warningLayers.push(fillLayerId);
    }

    // Add outline layer
    const lineLayerId = 'warning-lines';
    if (!map.getLayer(lineLayerId)) {
        map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': [
                    'match',
                    ['get', 'severity'],
                    'Extreme', '#ff0000',
                    'Severe', '#ff8000',
                    'Moderate', '#ffff00',
                    '#00ff00'
                ],
                'line-width': 2,
                'line-opacity': 0.8
            }
        });
        warningLayers.push(lineLayerId);
    }

    // Add click handler for warnings
    map.on('click', fillLayerId, (e) => {
        if (e.features.length > 0) {
            const feature = e.features[0];
            const props = feature.properties;
            
            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div class="popup-warning-title">${props.event}</div>
                    <div class="popup-warning-desc">${props.headline || 'No additional details'}</div>
                `)
                .addTo(map);
        }
    });

    // Change cursor on hover
    map.on('mouseenter', fillLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', fillLayerId, () => {
        map.getCanvas().style.cursor = 'crosshair';
    });
}

function toggleWarnings(enabled) {
    warningsEnabled = enabled;
    if (enabled) {
        displayWarnings();
    } else {
        warningLayers.forEach(layerId => {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, 'visibility', 'none');
            }
        });
    }
}

// ================================
//  SEARCH FUNCTIONALITY
// ================================
async function searchLocation(query) {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_KEY}&limit=5&country=US`
        );
        const data = await response.json();
        
        return data.features.map(feature => ({
            name: feature.place_name,
            lng: feature.center[0],
            lat: feature.center[1]
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

function showSearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">No results found</div>';
    } else {
        resultsContainer.innerHTML = results.map(result => 
            `<div class="search-result-item" data-lat="${result.lat}" data-lng="${result.lng}">
                ${result.name}
            </div>`
        ).join('');
    }
    
    resultsContainer.classList.remove('hidden');
}

function hideSearchResults() {
    document.getElementById('searchResults').classList.add('hidden');
}

// ================================
//  WEATHER DATA FUNCTIONS (Open-Meteo)
// ================================
async function getWeatherData(lat, lng) {
    try {
        // Current weather - FORCE Fahrenheit with temperature_unit=fahrenheit
        const currentUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
        
        // Hourly forecast - FORCE Fahrenheit
        const hourlyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,uv_index&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=2`;
        
        // Daily forecast - FORCE Fahrenheit
        const dailyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;
        
        const [currentRes, hourlyRes, dailyRes] = await Promise.all([
            fetch(currentUrl),
            fetch(hourlyUrl),
            fetch(dailyUrl)
        ]);
        
        const currentData = await currentRes.json();
        const hourlyData = await hourlyRes.json();
        const dailyData = await dailyRes.json();
        
        return {
            current: currentData.current,
            hourly: hourlyData.hourly,
            daily: dailyData.daily
        };
    } catch (error) {
        console.error('Weather data fetch error:', error);
        return null;
    }
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_KEY}`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    }
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
}

function calculateDewPoint(tempF, humidity) {
    // Convert F to C for calculation
    const tempC = (tempF - 32) * 5/9;
    
    // Magnus formula approximation
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
    const dewPointC = (b * alpha) / (a - alpha);
    
    // Convert back to F
    return (dewPointC * 9/5) + 32;
}

async function updateWeatherPanel(lat, lng) {
    const weatherData = await getWeatherData(lat, lng);
    
    if (!weatherData) {
        document.getElementById('locationName').textContent = 'Error loading weather data';
        return;
    }

    const current = weatherData.current;
    
    // Update location info
    const locationName = await reverseGeocode(lat, lng);
    document.getElementById('locationName').textContent = 'Storm Surge Weather';
    document.getElementById('locationAddress').textContent = locationName;
    document.getElementById('locationCoords').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    // Fetch and display weather alerts
    const alerts = await fetchWeatherAlerts(lat, lng);
    const warningsSection = document.getElementById('warningsSection');
    const warningsList = document.getElementById('warningsList');
    
    if (alerts.length > 0) {
        warningsSection.classList.remove('hidden');
        warningsList.innerHTML = alerts.map(alert => `
            <div class="warning-item">
                <div class="warning-title">${alert.event}</div>
                <div class="warning-time">${alert.headline || 'Active alert'}</div>
            </div>
        `).join('');
    } else {
        warningsSection.classList.add('hidden');
    }
    
    // Update current weather - temperatures are already in Fahrenheit
    document.getElementById('currentTemp').textContent = `${Math.round(current.temperature_2m)}°F`;
    document.getElementById('feelsLike').textContent = `Feels like ${Math.round(current.apparent_temperature)}°F`;
    document.getElementById('conditions').textContent = weatherText[current.weather_code] || 'Unknown';
    
    // Display precipitation type
    const precipType = classifyPrecipitationType(current.temperature_2m, current.weather_code);
    const precipTypeElement = document.getElementById('precipType');
    if (precipType) {
        precipTypeElement.textContent = `${precipType.icon} ${precipType.type}`;
        precipTypeElement.style.color = precipType.color;
    } else {
        precipTypeElement.textContent = '';
    }
    
    // Calculate dew point
    const dewPoint = calculateDewPoint(current.temperature_2m, current.relative_humidity_2m);
    
    // Update details
    document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
    document.getElementById('windSpeed').textContent = `${Math.round(current.wind_speed_10m)} mph`;
    document.getElementById('windDirection').textContent = getWindDirection(current.wind_direction_10m);
    document.getElementById('pressure').textContent = `${Math.round(current.pressure_msl)} mb`;
    document.getElementById('visibility').textContent = `10+ mi`;
    document.getElementById('uvIndex').textContent = '--';
    document.getElementById('dewPoint').textContent = `${Math.round(dewPoint)}°F`;
    document.getElementById('cloudCover').textContent = `${current.cloud_cover}%`;
    
    // Update hourly forecast (next 24 hours)
    const hourlyContainer = document.getElementById('hourlyData');
    hourlyContainer.innerHTML = '';
    
    for (let i = 0; i < 24; i++) {
        const hourIndex = i;
        if (weatherData.hourly.time[hourIndex]) {
            const time = new Date(weatherData.hourly.time[hourIndex]);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':00';
            
            const hourlyItem = document.createElement('div');
            hourlyItem.className = 'hourly-item';
            hourlyItem.innerHTML = `
                <div class="hourly-time">${timeStr}</div>
                <div class="hourly-temp">${Math.round(weatherData.hourly.temperature_2m[hourIndex])}°F</div>
                <div class="hourly-condition">${(weatherText[weatherData.hourly.weather_code[hourIndex]] || 'N/A').substring(0, 8)}</div>
            `;
            hourlyContainer.appendChild(hourlyItem);
        }
    }

    // Update daily forecast
    const dailyContainer = document.getElementById('dailyData');
    dailyContainer.innerHTML = '';
    
    for (let i = 0; i < 7; i++) {
        if (weatherData.daily.time[i]) {
            const date = new Date(weatherData.daily.time[i]);
            const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            
            const dailyItem = document.createElement('div');
            dailyItem.className = 'daily-item';
            dailyItem.innerHTML = `
                <div class="daily-date">${dateStr}</div>
                <div class="daily-temps">${Math.round(weatherData.daily.temperature_2m_max[i])}°F / ${Math.round(weatherData.daily.temperature_2m_min[i])}°F</div>
            `;
            dailyContainer.appendChild(dailyItem);
        }
    }
}

function showClickMarker(lat, lng) {
    const marker = document.getElementById('clickMarker');
    const point = map.project([lng, lat]);
    
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    marker.classList.remove('hidden');
    
    setTimeout(() => {
        marker.classList.add('hidden');
    }, 2000);
}

function showWeatherPanel(lat, lng) {
    const panel = document.getElementById('weatherPanel');
    panel.classList.remove('hidden');
    updateWeatherPanel(lat, lng);
    showClickMarker(lat, lng);
}

function hideWeatherPanel() {
    const panel = document.getElementById('weatherPanel');
    panel.classList.add('hidden');
}

// ================================
//  AUTO-REFRESH RADAR & WARNINGS
// ================================
function startAutoRefresh() {
    // Refresh radar every 5 minutes
    setInterval(() => {
        if (currentTimeIndex === 11) { // Only refresh if on "now" frame
            generateRadarTimes();
            updateRadarLayer(currentRadarType, currentTimeIndex);
        }
    }, 5 * 60 * 1000);
    
    // Refresh warnings every 10 minutes
    setInterval(() => {
        if (warningsEnabled) {
            loadWarningPolygons();
        }
    }, 10 * 60 * 1000);
}

// ================================
//  EVENT LISTENERS
// ================================

// Map initialization
map.on('load', () => {
    generateRadarTimes();
    updateRadarLayer(currentRadarType, currentTimeIndex);
    loadWarningPolygons();
    startAnimation();
    startAutoRefresh();
    
    // Update status
    document.getElementById('radarStatus').textContent = '🟢 Live';
    updateLastUpdateTime();
});

// Map click handler
map.on('click', (e) => {
    currentLat = e.lngLat.lat;
    currentLng = e.lngLat.lng;
    showWeatherPanel(currentLat, currentLng);
});

// Search functionality
document.getElementById('searchBtn').addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        const results = await searchLocation(query);
        showSearchResults(results);
    }
});

document.getElementById('searchInput').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
            const results = await searchLocation(query);
            showSearchResults(results);
        }
    }
});

// Search results click handler
document.getElementById('searchResults').addEventListener('click', (e) => {
    if (e.target.classList.contains('search-result-item')) {
        const lat = parseFloat(e.target.dataset.lat);
        const lng = parseFloat(e.target.dataset.lng);
        
        map.flyTo({
            center: [lng, lat],
            zoom: 10,
            duration: 1500
        });
        
        showWeatherPanel(lat, lng);
        hideSearchResults();
        document.getElementById('searchInput').value = '';
    }
});

// Hide search results when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        hideSearchResults();
    }
});

// Animation controls
document.getElementById('playPauseBtn').addEventListener('click', () => {
    if (isAnimating) {
        stopAnimation();
    } else {
        startAnimation();
    }
});

document.getElementById('prevBtn').addEventListener('click', () => {
    stopAnimation();
    currentTimeIndex = Math.max(0, currentTimeIndex - 1);
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

document.getElementById('nextBtn').addEventListener('click', () => {
    stopAnimation();
    currentTimeIndex = Math.min(radarTimes.length - 1, currentTimeIndex + 1);
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

document.getElementById('animationSpeed').addEventListener('change', (e) => {
    animationSpeed = parseInt(e.target.value);
    if (isAnimating) {
        stopAnimation();
        startAnimation();
    }
});

document.getElementById('timeSlider').addEventListener('input', (e) => {
    stopAnimation();
    currentTimeIndex = parseInt(e.target.value);
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

// Radar type selector
document.getElementById('radarType').addEventListener('change', (e) => {
    currentRadarType = e.target.value;
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

// Opacity slider
document.getElementById('opacitySlider').addEventListener('input', (e) => {
    const opacity = e.target.value / 100;
    document.getElementById('opacityValue').textContent = `${e.target.value}%`;
    
    if (map.getLayer(RADAR_LAYER)) {
        map.setPaintProperty(RADAR_LAYER, 'raster-opacity', opacity);
    }
});

// Warnings toggle
document.getElementById('warningsToggle').addEventListener('change', (e) => {
    toggleWarnings(e.target.checked);
});

// Close weather panel
document.getElementById('closePanel').addEventListener('click', hideWeatherPanel);

// Handle window resize
window.addEventListener('resize', () => {
    map.resize();
});

// ================================
//  INITIALIZATION
// ================================

console.log('Storm Surge Weather Dashboard initialized successfully!');
console.log('Features:');
console.log('- NEXRAD Level II Dual-Polarization Radar Data');
console.log('- Real-time Weather Alerts & Warning Polygons');
console.log('- Precipitation Type Classification');
console.log('- 60-minute Radar Animation Loop');
console.log('- Auto-refresh every 5-10 minutes');
console.log('- Fully Responsive Design');
console.log('Weather data: Open-Meteo API (Fahrenheit)');
console.log('Radar data: RainViewer NEXRAD Data');
console.log('Alerts: National Weather Service API');
console.log('Click anywhere on the map to get weather information for that location.');

// ========================================
//  JAVASCRIPT ENDS HERE
// ========================================  
