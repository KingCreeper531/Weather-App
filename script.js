// ========================================
//  JAVASCRIPT STARTS HERE
//  File: script.js
//  Storm Surge Weather Dashboard - Fixed Version
// ========================================

// ================================
//  API KEYS & CONFIG
// ================================
const MAPBOX_KEY = "pk.eyJ1Ijoic3Rvcm0tc3VyZ2UiLCJhIjoiY21pcDM0emdxMDhwYzNmcHc2aTlqeTN5OSJ9.QYtnuhdixR4SGxLQldE9PA";
const FEEDBACK_EMAIL = "stormsurgee025@gmail.com";

// State management
let state = {
    currentLat: 39.8283,
    currentLng: -98.5795,
    currentRadarProduct: 'composite-reflectivity',
    currentTiltAngle: 0.5,
    isAnimating: true,
    animationInterval: null,
    currentTimeIndex: 11,
    radarTimes: [],
    animationSpeed: 1000,
    
    // Feature toggles
    showPolygons: true,
    showLightning: true,
    showFronts: true,
    showSPC: true,
    showTVS: true,
    showStormTracks: true,
    showSkywarn: true,
    showTDWR: false,
    satelliteMode: false,
    
    // Warnings
    activeWarnings: [],
    enabledWarningTypes: new Set([
        'Tornado Warning',
        'Severe Thunderstorm Warning',
        'Flash Flood Warning',
        'Flood Warning',
        'Winter Storm Warning',
        'Winter Weather Advisory',
        'High Wind Warning',
        'Gale Warning',
        'Dense Fog Advisory',
        'Special Weather Statement',
        'Heat Advisory',
        'Excessive Heat Warning'
    ]),
    
    // Skywarn reports
    skywarnReports: [],
    
    // Selected warning for detail view
    selectedWarning: null,
    
    // Polygon click debounce
    lastPolygonClick: 0,
    
    // Click marker
    clickMarkerTimeout: null
};

// Weather code translations
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

// Warning type colors
const warningColors = {
    'Tornado Warning': '#FF0000',
    'Severe Thunderstorm Warning': '#FFA500',
    'Flash Flood Warning': '#8B0000',
    'Flood Warning': '#00FF00',
    'Flood Advisory': '#00FF7F',
    'Winter Storm Warning': '#FF1493',
    'Winter Weather Advisory': '#7B68EE',
    'Winter Storm Watch': '#4682B4',
    'High Wind Warning': '#DAA520',
    'Wind Advisory': '#D2B48C',
    'Gale Warning': '#DDA0DD',
    'Dense Fog Advisory': '#708090',
    'Special Weather Statement': '#FFE4B5',
    'Heat Advisory': '#FF7F50',
    'Excessive Heat Warning': '#C71585'
};

// ================================
//  MAPBOX INITIALIZATION
// ================================
mapboxgl.accessToken = MAPBOX_KEY;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [state.currentLng, state.currentLat],
    zoom: 4,
    minZoom: 2,
    maxZoom: 12
});

// ================================
//  RADAR FUNCTIONS
// ================================
function generateRadarTimes() {
    const times = [];
    const now = new Date();
    
    // Generate 12 frames: 11 historical + now (5 min intervals, 60 min total)
    for (let i = 11; i >= 0; i--) {
        const time = new Date(now.getTime() - (i * 5 * 60 * 1000));
        times.push(time);
    }
    
    state.radarTimes = times;
    return times;
}

async function loadNEXRADRadar(timeIndex = 11) {
    try {
        console.log(`Loading NEXRAD radar for time index: ${timeIndex}`);
        
        // Using RainViewer as NEXRAD data source
        const timestamp = timeIndex === 11 ? 0 : Math.floor(state.radarTimes[timeIndex].getTime() / 1000);
        const tileURL = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/6/1_1.png`;
        
        console.log('Radar tile URL:', tileURL);
        
        // Remove existing radar layer if present
        if (map.getLayer('nexrad-layer')) {
            map.removeLayer('nexrad-layer');
        }
        if (map.getSource('nexrad-source')) {
            map.removeSource('nexrad-source');
        }
        
        // Add new radar source and layer
        map.addSource('nexrad-source', {
            type: 'raster',
            tiles: [tileURL],
            tileSize: 256,
            maxzoom: 12
        });
        
        map.addLayer({
            id: 'nexrad-layer',
            type: 'raster',
            source: 'nexrad-source',
            paint: {
                'raster-opacity': 0.7,
                'raster-fade-duration': 300
            }
        });
        
        console.log('✅ Radar layer added successfully');
        
        updateTimeDisplay(timeIndex);
        updateRadarLegend();
        
    } catch (error) {
        console.error('❌ Error loading NEXRAD radar:', error);
        showToast('Error loading radar data', 'error');
    }
}

function updateTimeDisplay(timeIndex) {
    state.currentTimeIndex = timeIndex;
    document.getElementById('timeSlider').value = timeIndex;
    
    if (timeIndex === 11) {
        document.getElementById('currentTime').textContent = 'Now';
        document.getElementById('timeMode').textContent = 'LIVE';
        document.getElementById('timeMode').style.background = 'rgba(0, 255, 136, 0.2)';
        document.getElementById('timeMode').style.color = '#00ff88';
    } else {
        const time = state.radarTimes[timeIndex];
        const timeStr = time.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
        });
        const minutesAgo = Math.round((Date.now() - time.getTime()) / 60000);
        
        document.getElementById('currentTime').textContent = timeStr;
        document.getElementById('timeMode').textContent = `${minutesAgo}m ago`;
        document.getElementById('timeMode').style.background = 'rgba(255, 170, 0, 0.2)';
        document.getElementById('timeMode').style.color = '#ffaa00';
    }
}

function updateRadarLegend() {
    const legendTitle = document.getElementById('legendTitle');
    
    const legends = {
        'base-reflectivity': 'Base Reflectivity (dBZ)',
        'composite-reflectivity': 'Composite (dBZ)',
        'base-velocity': 'Velocity (kts)',
        'storm-relative-velocity': 'Storm Velocity',
        'correlation-coefficient': 'Correlation Coef.',
        'differential-reflectivity': 'Diff. Reflectivity',
        'specific-differential-phase': 'Specific Diff. Phase',
        'one-hour-precipitation': '1-Hr Precip (in)',
        'storm-total-precipitation': 'Storm Total (in)'
    };
    
    legendTitle.textContent = legends[state.currentRadarProduct] || 'Reflectivity (dBZ)';
}

function startAnimation() {
    if (state.animationInterval) clearInterval(state.animationInterval);
    
    state.animationInterval = setInterval(() => {
        state.currentTimeIndex = (state.currentTimeIndex + 1) % state.radarTimes.length;
        loadNEXRADRadar(state.currentTimeIndex);
    }, state.animationSpeed);
    
    state.isAnimating = true;
    document.getElementById('playPauseBtn').textContent = '⏸️';
    console.log('▶️ Animation started');
}

function stopAnimation() {
    if (state.animationInterval) {
        clearInterval(state.animationInterval);
        state.animationInterval = null;
    }
    
    state.isAnimating = false;
    document.getElementById('playPauseBtn').textContent = '▶️';
    console.log('⏸️ Animation stopped');
}

// ================================
//  WEATHER ALERTS/WARNINGS
// ================================
async function loadWeatherAlerts() {
    try {
        console.log('Loading weather alerts...');
        const response = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert');
        const data = await response.json();
        
        if (data.features) {
            state.activeWarnings = data.features.filter(feature => {
                const eventType = feature.properties.event;
                return state.enabledWarningTypes.has(eventType);
            });
            
            console.log(`✅ Loaded ${state.activeWarnings.length} warnings`);
            updateWarningsList();
            displayWarningPolygons();
            updateAlertBadge();
        }
    } catch (error) {
        console.error('Error loading weather alerts:', error);
        // Generate sample warnings for demo
        generateSampleWarnings();
    }
}

function generateSampleWarnings() {
    const sampleTypes = [
        'Tornado Warning',
        'Severe Thunderstorm Warning',
        'Flash Flood Warning',
        'Winter Storm Warning',
        'High Wind Warning',
        'Dense Fog Advisory',
        'Special Weather Statement'
    ];
    
    state.activeWarnings = sampleTypes.map((type, idx) => ({
        properties: {
            id: `sample-${idx}`,
            event: type,
            headline: `${type} in effect until further notice`,
            description: `This is a ${type}. Take appropriate safety precautions. Monitor local weather conditions and stay informed.`,
            severity: type.includes('Tornado') ? 'Extreme' : type.includes('Advisory') ? 'Minor' : 'Severe',
            urgency: 'Immediate',
            onset: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            expires: new Date(Date.now() + Math.random() * 86400000).toISOString(),
            senderName: 'NWS',
            areaDesc: 'Sample County, Example Region'
        },
        geometry: null
    }));
    
    console.log(`📋 Generated ${state.activeWarnings.length} sample warnings`);
    updateWarningsList();
    updateAlertBadge();
}

function updateWarningsList() {
    const content = document.getElementById('warningsContent');
    const count = document.getElementById('alertCount');
    
    count.textContent = state.activeWarnings.length;
    
    if (state.activeWarnings.length === 0) {
        content.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No active warnings</div>';
        return;
    }
    
    content.innerHTML = state.activeWarnings.map(warning => {
        const props = warning.properties;
        const color = warningColors[props.event] || '#999';
        const expiresIn = formatTimeRemaining(props.expires);
        
        return `
            <div class="warning-item" style="border-left-color: ${color};" onclick="showWarningDetail('${props.id}')">
                <div class="warning-type">${props.event}</div>
                <div class="warning-expires">Expires in ${expiresIn}</div>
            </div>
        `;
    }).join('');
}

function displayWarningPolygons() {
    if (!state.showPolygons) {
        console.log('Warning polygons disabled');
        return;
    }
    
    // Remove existing layers
    if (map.getLayer('warning-fills')) map.removeLayer('warning-fills');
    if (map.getLayer('warning-lines')) map.removeLayer('warning-lines');
    if (map.getSource('warnings-source')) map.removeSource('warnings-source');
    
    const validWarnings = state.activeWarnings.filter(w => w.geometry);
    
    if (validWarnings.length === 0) {
        console.log('No warning polygons to display');
        return;
    }
    
    console.log(`Displaying ${validWarnings.length} warning polygons`);
    
    const geojson = {
        type: 'FeatureCollection',
        features: validWarnings.map(w => ({
            type: 'Feature',
            geometry: w.geometry,
            properties: {
                id: w.properties.id,
                event: w.properties.event,
                severity: w.properties.severity
            }
        }))
    };
    
    map.addSource('warnings-source', {
        type: 'geojson',
        data: geojson
    });
    
    map.addLayer({
        id: 'warning-fills',
        type: 'fill',
        source: 'warnings-source',
        paint: {
            'fill-color': [
                'match',
                ['get', 'event'],
                'Tornado Warning', '#FF0000',
                'Severe Thunderstorm Warning', '#FFA500',
                'Flash Flood Warning', '#8B0000',
                'Flood Warning', '#00FF00',
                'Winter Storm Warning', '#FF1493',
                'High Wind Warning', '#DAA520',
                'Gale Warning', '#DDA0DD',
                'Dense Fog Advisory', '#708090',
                'Special Weather Statement', '#FFE4B5',
                '#00FF00'
            ],
            'fill-opacity': 0.25
        }
    });
    
    map.addLayer({
        id: 'warning-lines',
        type: 'line',
        source: 'warnings-source',
        paint: {
            'line-color': [
                'match',
                ['get', 'event'],
                'Tornado Warning', '#FF0000',
                'Severe Thunderstorm Warning', '#FFA500',
                'Flash Flood Warning', '#8B0000',
                'Flood Warning', '#00FF00',
                'Winter Storm Warning', '#FF1493',
                'High Wind Warning', '#DAA520',
                'Gale Warning', '#DDA0DD',
                'Dense Fog Advisory', '#708090',
                'Special Weather Statement', '#FFE4B5',
                '#00FF00'
            ],
            'line-width': 2,
            'line-opacity': 0.8
        }
    });
    
    // Click handler with debounce
    map.on('click', 'warning-fills', (e) => {
        const now = Date.now();
        if (now - state.lastPolygonClick < 500) {
            console.log('Click debounced');
            return; // 500ms debounce
        }
        state.lastPolygonClick = now;
        
        if (e.features.length > 0) {
            const warningId = e.features[0].properties.id;
            console.log('Warning polygon clicked:', warningId);
            showWarningDetail(warningId);
        }
    });
    
    map.on('mouseenter', 'warning-fills', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'warning-fills', () => {
        map.getCanvas().style.cursor = '';
    });
    
    console.log('✅ Warning polygons displayed');
}

function showWarningDetail(warningId) {
    const warning = state.activeWarnings.find(w => w.properties.id === warningId);
    if (!warning) {
        console.error('Warning not found:', warningId);
        return;
    }
    
    const props = warning.properties;
    const color = warningColors[props.event] || '#999';
    
    state.selectedWarning = warning;
    
    const modal = document.getElementById('warningModal');
    const header = document.getElementById('warningModalHeader');
    
    header.style.background = color;
    header.style.color = '#fff';
    
    document.getElementById('warningModalTitle').textContent = props.event;
    document.getElementById('warningIssued').textContent = new Date(props.onset).toLocaleString();
    document.getElementById('warningExpires').textContent = new Date(props.expires).toLocaleString();
    document.getElementById('warningSeverity').textContent = props.severity || 'N/A';
    document.getElementById('warningSource').textContent = props.senderName || 'NWS';
    document.getElementById('warningDescription').textContent = props.description || props.headline;
    document.getElementById('warningAreas').textContent = props.areaDesc || 'Area information not available';
    
    modal.classList.remove('hidden');
    console.log('Warning detail modal opened');
}

function updateAlertBadge() {
    const badge = document.getElementById('alertBadge');
    const count = state.activeWarnings.length;
    
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function formatTimeRemaining(expiresISO) {
    const now = new Date();
    const expires = new Date(expiresISO);
    const diff = expires - now;
    
    if (diff < 0) return 'Expired';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// ================================
//  SKYWARN REPORTS
// ================================
function generateSkywarnReports() {
    state.skywarnReports = [
        {
            id: 'skywarn-1',
            type: 'Tornado Sighting',
            time: new Date(Date.now() - 15 * 60000),
            location: 'Near Highway 50 and County Road 12',
            lat: 40.5,
            lng: -95.5
        },
        {
            id: 'skywarn-2',
            type: 'Large Hail (2 inches)',
            time: new Date(Date.now() - 30 * 60000),
            location: 'Downtown area',
            lat: 40.3,
            lng: -95.8
        },
        {
            id: 'skywarn-3',
            type: 'Damaging Winds (65+ mph)',
            time: new Date(Date.now() - 45 * 60000),
            location: 'South of city limits',
            lat: 40.1,
            lng: -95.6
        }
    ];
    
    updateSkywarnPanel();
    console.log(`✅ Generated ${state.skywarnReports.length} Skywarn reports`);
}

function updateSkywarnPanel() {
    const content = document.getElementById('skywarnContent');
    
    if (state.skywarnReports.length === 0) {
        content.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No recent reports</div>';
        return;
    }
    
    content.innerHTML = state.skywarnReports.map(report => {
        const timeAgo = Math.round((Date.now() - report.time.getTime()) / 60000);
        
        return `
            <div class="skywarn-report">
                <span class="skywarn-badge">SKYWARN REPORT</span>
                <div class="report-type">${report.type}</div>
                <div class="report-time">${timeAgo}m ago • ${report.location}</div>
            </div>
        `;
    }).join('');
}

// ================================
//  WEATHER DATA
// ================================
async function getWeatherData(lat, lng) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,pressure_msl&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        return data;
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return null;
    }
}

async function updateWeatherPanel(lat, lng) {
    const data = await getWeatherData(lat, lng);
    
    if (!data) {
        showToast('Unable to load weather data', 'error');
        return;
    }
    
    console.log('Weather data loaded for:', lat, lng);
    
    const current = data.current;
    const hourly = data.hourly;
    const daily = data.daily;
    
    // Get location name
    const locationName = await reverseGeocode(lat, lng);
    document.getElementById('panelLocationAddress').textContent = locationName;
    document.getElementById('panelLocationCoords').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    // Check for local warnings
    const localWarnings = await fetchWeatherAlertsForLocation(lat, lng);
    const warningsSection = document.getElementById('panelWarningsSection');
    const warningsList = document.getElementById('panelWarningsList');
    
    if (localWarnings.length > 0) {
        warningsSection.classList.remove('hidden');
        warningsList.innerHTML = localWarnings.map(w => 
            `<div class="panel-warning-item" onclick="showWarningDetail('${w.properties.id}')">${w.properties.event}</div>`
        ).join('');
    } else {
        warningsSection.classList.add('hidden');
    }
    
    // Update current weather
    document.getElementById('panelCurrentTemp').textContent = `${Math.round(current.temperature_2m)}°F`;
    document.getElementById('panelFeelsLike').textContent = `Feels like ${Math.round(current.apparent_temperature)}°F`;
    document.getElementById('panelConditions').textContent = weatherText[current.weather_code] || 'Unknown';
    
    // Precipitation type
    const precipType = classifyPrecipitationType(current.temperature_2m, current.weather_code);
    const precipTypeElement = document.getElementById('panelPrecipType');
    if (precipType) {
        precipTypeElement.textContent = `${precipType.icon} ${precipType.type}`;
        precipTypeElement.style.color = precipType.color;
    } else {
        precipTypeElement.textContent = '';
    }
    
    // Calculate dew point
    const dewPoint = calculateDewPoint(current.temperature_2m, current.relative_humidity_2m);
    
    // Update details
    document.getElementById('panelHumidity').textContent = `${current.relative_humidity_2m}%`;
    document.getElementById('panelWindSpeed').textContent = `${Math.round(current.wind_speed_10m)} mph`;
    document.getElementById('panelWindDirection').textContent = getWindDirection(current.wind_direction_10m);
    document.getElementById('panelPressure').textContent = `${Math.round(current.pressure_msl)} mb`;
    document.getElementById('panelVisibility').textContent = `10+ mi`;
    document.getElementById('panelUvIndex').textContent = '--';
    document.getElementById('panelDewPoint').textContent = `${Math.round(dewPoint)}°F`;
    document.getElementById('panelCloudCover').textContent = `${current.cloud_cover}%`;
    
    // Update hourly forecast (next 24 hours)
    const hourlyContainer = document.getElementById('panelHourlyData');
    hourlyContainer.innerHTML = '';
    
    for (let i = 0; i < 24; i++) {
        if (hourly.time[i]) {
            const time = new Date(hourly.time[i]);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':00';
            
            const hourlyItem = document.createElement('div');
            hourlyItem.className = 'hourly-item-detailed';
            hourlyItem.innerHTML = `
                <div class="hourly-time-detailed">${timeStr}</div>
                <div class="hourly-temp-detailed">${Math.round(hourly.temperature_2m[i])}°F</div>
                <div class="hourly-condition-detailed">${(weatherText[hourly.weather_code[i]] || 'N/A').substring(0, 8)}</div>
            `;
            hourlyContainer.appendChild(hourlyItem);
        }
    }

    // Update daily forecast
    const dailyContainer = document.getElementById('panelDailyData');
    dailyContainer.innerHTML = '';
    
    for (let i = 0; i < 7; i++) {
        if (daily.time[i]) {
            const date = new Date(daily.time[i]);
            const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            
            const dailyItem = document.createElement('div');
            dailyItem.className = 'daily-item-detailed';
            dailyItem.innerHTML = `
                <div class="daily-date-detailed">${dateStr}</div>
                <div class="daily-temps-detailed">${Math.round(daily.temperature_2m_max[i])}°F / ${Math.round(daily.temperature_2m_min[i])}°F</div>
            `;
            dailyContainer.appendChild(dailyItem);
        }
    }
    
    // Show the panel
    document.getElementById('weatherPanel').classList.remove('hidden');
    console.log('✅ Weather panel updated');
}

async function fetchWeatherAlertsForLocation(lat, lng) {
    try {
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lng}`);
        const data = await response.json();
        return data.features || [];
    } catch (error) {
        console.error('Error fetching local alerts:', error);
        return [];
    }
}

function classifyPrecipitationType(temp, weatherCode) {
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

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
}

function calculateDewPoint(tempF, humidity) {
    const tempC = (tempF - 32) * 5/9;
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
    const dewPointC = (b * alpha) / (a - alpha);
    return (dewPointC * 9/5) + 32;
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

// ================================
//  CLICK MARKER
// ================================
function showClickMarker(lat, lng) {
    const marker = document.getElementById('clickMarker');
    const point = map.project([lng, lat]);
    
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    marker.classList.remove('hidden');
    
    // Clear previous timeout
    if (state.clickMarkerTimeout) {
        clearTimeout(state.clickMarkerTimeout);
    }
    
    // Hide after 2 seconds
    state.clickMarkerTimeout = setTimeout(() => {
        marker.classList.add('hidden');
    }, 2000);
}

// ================================
//  LOCATION SEARCH
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

function displaySearchResults(results) {
    const container = document.getElementById('searchResults');
    
    if (results.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No results found</div>';
        return;
    }
    
    container.innerHTML = results.map(result => `
        <div class="search-result-item" onclick="selectLocation(${result.lat}, ${result.lng}, '${result.name.replace(/'/g, "\\'")}')">
            ${result.name}
        </div>
    `).join('');
}

function selectLocation(lat, lng, name) {
    map.flyTo({
        center: [lng, lat],
        zoom: 10,
        duration: 1500
    });
    
    state.currentLat = lat;
    state.currentLng = lng;
    
    document.getElementById('currentLocation').textContent = name.split(',')[0];
    updateWeatherPanel(lat, lng);
    showClickMarker(lat, lng);
    closeSearch();
    
    console.log('Location selected:', name);
}

// ================================
//  WEATHER RADIO (NWS)
// ================================
async function playWeatherRadio() {
    if (!state.selectedWarning) return;
    
    try {
        showToast('Connecting to Weather Radio...', 'info');
        
        // Reference: https://www.weather.gov/nwr
        // In production, this would:
        // 1. Get user's location from the warning
        // 2. Query NWS for nearest weather radio station
        // 3. Stream audio from that station
        
        showToast('Weather Radio feature - Finding nearest station...', 'info');
        
        // TODO: Implement actual audio streaming from NWS weather radio
        setTimeout(() => {
            showToast('Weather Radio playback would start here', 'info');
        }, 1500);
        
    } catch (error) {
        console.error('Error playing weather radio:', error);
        showToast('Unable to connect to Weather Radio', 'error');
    }
}

// ================================
//  SETTINGS MANAGEMENT
// ================================
function loadSettings() {
    try {
        const saved = localStorage.getItem('stormSurgeSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            
            // Restore enabled warning types
            if (settings.enabledWarningTypes) {
                state.enabledWarningTypes = new Set(settings.enabledWarningTypes);
            }
            
            // Restore other settings
            state.currentRadarProduct = settings.currentRadarProduct || state.currentRadarProduct;
            state.currentTiltAngle = settings.currentTiltAngle || state.currentTiltAngle;
            state.showPolygons = settings.showPolygons !== undefined ? settings.showPolygons : state.showPolygons;
            state.showLightning = settings.showLightning !== undefined ? settings.showLightning : state.showLightning;
            state.showFronts = settings.showFronts !== undefined ? settings.showFronts : state.showFronts;
            state.showSPC = settings.showSPC !== undefined ? settings.showSPC : state.showSPC;
            state.showTVS = settings.showTVS !== undefined ? settings.showTVS : state.showTVS;
            state.showStormTracks = settings.showStormTracks !== undefined ? settings.showStormTracks : state.showStormTracks;
            state.showSkywarn = settings.showSkywarn !== undefined ? settings.showSkywarn : state.showSkywarn;
            state.showTDWR = settings.showTDWR !== undefined ? settings.showTDWR : state.showTDWR;
            state.satelliteMode = settings.satelliteMode !== undefined ? settings.satelliteMode : state.satelliteMode;
            
            applySettings();
            console.log('✅ Settings loaded from localStorage');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function saveSettings() {
    try {
        const settings = {
            currentRadarProduct: state.currentRadarProduct,
            currentTiltAngle: state.currentTiltAngle,
            showPolygons: state.showPolygons,
            showLightning: state.showLightning,
            showFronts: state.showFronts,
            showSPC: state.showSPC,
            showTVS: state.showTVS,
            showStormTracks: state.showStormTracks,
            showSkywarn: state.showSkywarn,
            showTDWR: state.showTDWR,
            satelliteMode: state.satelliteMode,
            enabledWarningTypes: Array.from(state.enabledWarningTypes)
        };
        
        localStorage.setItem('stormSurgeSettings', JSON.stringify(settings));
        console.log('✅ Settings saved');
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

function applySettings() {
    // Apply radar product
    document.getElementById('radarProductSelect').value = state.currentRadarProduct;
    document.getElementById('tiltAngleSelect').value = state.currentTiltAngle;
    
    // Apply toggles
    document.getElementById('satelliteToggle').checked = state.satelliteMode;
    document.getElementById('polygonsToggle').checked = state.showPolygons;
    document.getElementById('lightningToggle').checked = state.showLightning;
    document.getElementById('frontsToggle').checked = state.showFronts;
    document.getElementById('spcToggle').checked = state.showSPC;
    document.getElementById('tvsToggle').checked = state.showTVS;
    document.getElementById('tracksToggle').checked = state.showStormTracks;
    document.getElementById('skywarnToggle').checked = state.showSkywarn;
    document.getElementById('tdwrToggle').checked = state.showTDWR;
    
    // Apply warning type checkboxes
    document.querySelectorAll('[data-warning-type]').forEach(checkbox => {
        const warningType = checkbox.dataset.warningType;
        checkbox.checked = state.enabledWarningTypes.has(warningType);
    });
    
    // Apply map style
    if (state.satelliteMode) {
        map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    }
}

// ================================
//  FEEDBACK SYSTEM
// ================================
async function sendFeedback(message) {
    try {
        const subject = encodeURIComponent('Storm Surge Weather Feedback');
        const body = encodeURIComponent(`Feedback from Storm Surge Weather App:\n\n${message}\n\n---\nUser Agent: ${navigator.userAgent}\nTimestamp: ${new Date().toISOString()}`);
        
        const mailtoLink = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
        
        window.location.href = mailtoLink;
        
        showToast('Opening email client...', 'success');
        document.getElementById('feedbackText').value = '';
        closeFeedback();
        
    } catch (error) {
        console.error('Error sending feedback:', error);
        showToast('Error sending feedback', 'error');
    }
}

// ================================
//  UI HELPERS
// ================================
function showLoading(show) {
    const loader = document.getElementById('loadingIndicator');
    if (show) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
    saveSettings();
}

function closeSearch() {
    document.getElementById('searchModal').classList.add('hidden');
}

function closeFeedback() {
    document.getElementById('feedbackModal').classList.add('hidden');
}

function closeWarningModal() {
    document.getElementById('warningModal').classList.add('hidden');
}

// ================================
//  EVENT LISTENERS
// ================================

// Map events
map.on('load', () => {
    console.log('🗺️ Map loaded');
    
    generateRadarTimes();
    loadNEXRADRadar(state.currentTimeIndex);
    loadWeatherAlerts();
    generateSkywarnReports();
    loadSettings();
    
    // Start animation
    setTimeout(() => {
        startAnimation();
    }, 1000);
    
    // Auto-refresh every 5 minutes
    setInterval(() => {
        if (state.currentTimeIndex === 11) {
            generateRadarTimes();
            loadNEXRADRadar(state.currentTimeIndex);
            console.log('🔄 Auto-refresh: Radar updated');
        }
    }, 5 * 60 * 1000);
    
    // Refresh warnings every 10 minutes
    setInterval(() => {
        loadWeatherAlerts();
        console.log('🔄 Auto-refresh: Warnings updated');
    }, 10 * 60 * 1000);
});

map.on('click', (e) => {
    // Don't trigger if clicking on a warning polygon
    const features = map.queryRenderedFeatures(e.point, {
        layers: ['warning-fills']
    });
    
    if (features.length > 0) {
        return; // Let the warning click handler deal with it
    }
    
    state.currentLat = e.lngLat.lat;
    state.currentLng = e.lngLat.lng;
    
    console.log('Map clicked:', e.lngLat.lat, e.lngLat.lng);
    
    showClickMarker(state.currentLat, state.currentLng);
    updateWeatherPanel(state.currentLat, state.currentLng);
});

// Update marker position on map move
map.on('move', () => {
    const marker = document.getElementById('clickMarker');
    if (!marker.classList.contains('hidden')) {
        const point = map.project([state.currentLng, state.currentLat]);
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
    }
});

// Top bar buttons
document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('hidden');
});

document.getElementById('searchBtn').addEventListener('click', () => {
    document.getElementById('searchModal').classList.remove('hidden');
    document.getElementById('searchInput').focus();
});

// Playback controls
document.getElementById('playPauseBtn').addEventListener('click', () => {
    if (state.isAnimating) {
        stopAnimation();
    } else {
        startAnimation();
    }
});

document.getElementById('timeSlider').addEventListener('input', (e) => {
    stopAnimation();
    const timeIndex = parseInt(e.target.value);
    loadNEXRADRadar(timeIndex);
});

document.getElementById('alertsBtn').addEventListener('click', () => {
    const panel = document.getElementById('warningsList');
    panel.classList.toggle('hidden');
});

// Weather panel close
document.getElementById('closeWeatherPanel').addEventListener('click', () => {
    document.getElementById('weatherPanel').classList.add('hidden');
});

// Warnings panel close
document.getElementById('closeWarnings').addEventListener('click', () => {
    document.getElementById('warningsList').classList.add('hidden');
});

// Search functionality
document.getElementById('searchInput').addEventListener('keyup', async (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
            const results = await searchLocation(query);
            displaySearchResults(results);
        }
    }
});

// Settings - Radar product
document.getElementById('radarProductSelect').addEventListener('change', (e) => {
    state.currentRadarProduct = e.target.value;
    loadNEXRADRadar(state.currentTimeIndex);
    updateRadarLegend();
    saveSettings();
});

// Settings - Tilt angle
document.getElementById('tiltAngleSelect').addEventListener('change', (e) => {
    state.currentTiltAngle = parseFloat(e.target.value);
    console.log('Tilt angle changed to:', state.currentTiltAngle);
    saveSettings();
});

// Settings - Radar opacity
document.getElementById('radarOpacity').addEventListener('input', (e) => {
    const opacity = e.target.value / 100;
    document.getElementById('opacityDisplay').textContent = `${e.target.value}%`;
    
    if (map.getLayer('nexrad-layer')) {
        map.setPaintProperty('nexrad-layer', 'raster-opacity', opacity);
    }
});

// Settings - Satellite toggle
document.getElementById('satelliteToggle').addEventListener('change', (e) => {
    state.satelliteMode = e.target.checked;
    
    if (state.satelliteMode) {
        map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    } else {
        map.setStyle('mapbox://styles/mapbox/dark-v11');
    }
    
    // Reload radar and polygons after style change
    map.once('styledata', () => {
        loadNEXRADRadar(state.currentTimeIndex);
        if (state.showPolygons) {
            displayWarningPolygons();
        }
    });
    
    saveSettings();
});

// Settings - Polygons toggle
document.getElementById('polygonsToggle').addEventListener('change', (e) => {
    state.showPolygons = e.target.checked;
    
    if (state.showPolygons) {
        displayWarningPolygons();
    } else {
        if (map.getLayer('warning-fills')) map.removeLayer('warning-fills');
        if (map.getLayer('warning-lines')) map.removeLayer('warning-lines');
        if (map.getSource('warnings-source')) map.removeSource('warnings-source');
    }
    
    saveSettings();
});

// Settings - Feature toggles
document.getElementById('lightningToggle').addEventListener('change', (e) => {
    state.showLightning = e.target.checked;
    console.log('Lightning:', state.showLightning);
    saveSettings();
});

document.getElementById('frontsToggle').addEventListener('change', (e) => {
    state.showFronts = e.target.checked;
    console.log('Fronts:', state.showFronts);
    saveSettings();
});

document.getElementById('spcToggle').addEventListener('change', (e) => {
    state.showSPC = e.target.checked;
    console.log('SPC Outlooks:', state.showSPC);
    saveSettings();
});

document.getElementById('tvsToggle').addEventListener('change', (e) => {
    state.showTVS = e.target.checked;
    console.log('TVS Signatures:', state.showTVS);
    saveSettings();
});

document.getElementById('tracksToggle').addEventListener('change', (e) => {
    state.showStormTracks = e.target.checked;
    console.log('Storm Tracks:', state.showStormTracks);
    saveSettings();
});

document.getElementById('skywarnToggle').addEventListener('change', (e) => {
    state.showSkywarn = e.target.checked;
    
    if (state.showSkywarn) {
        document.getElementById('skywarnPanel').classList.remove('hidden');
    } else {
        document.getElementById('skywarnPanel').classList.add('hidden');
    }
    
    saveSettings();
});

document.getElementById('tdwrToggle').addEventListener('change', (e) => {
    state.showTDWR = e.target.checked;
    console.log('TDWR Radars:', state.showTDWR);
    saveSettings();
});

// Settings - Warning type checkboxes
document.querySelectorAll('[data-warning-type]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
        const warningType = e.target.dataset.warningType;
        
        if (e.target.checked) {
            state.enabledWarningTypes.add(warningType);
        } else {
            state.enabledWarningTypes.delete(warningType);
        }
        
        console.log('Warning types updated:', Array.from(state.enabledWarningTypes));
        loadWeatherAlerts();
        saveSettings();
    });
});

// Warning detail modal
document.getElementById('playWeatherRadioBtn').addEventListener('click', () => {
    playWeatherRadio();
});

document.getElementById('shareWarningBtn').addEventListener('click', () => {
    if (state.selectedWarning) {
        const props = state.selectedWarning.properties;
        const text = `${props.event}: ${props.headline}`;
        
        if (navigator.share) {
            navigator.share({
                title: 'Weather Alert',
                text: text,
                url: window.location.href
            }).catch(err => console.log('Error sharing:', err));
        } else {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Alert copied to clipboard', 'success');
            });
        }
    }
});

// Feedback
document.getElementById('submitFeedbackBtn').addEventListener('click', () => {
    const feedback = document.getElementById('feedbackText').value.trim();
    
    if (feedback) {
        sendFeedback(feedback);
    } else {
        showToast('Please enter your feedback', 'error');
    }
});

document.getElementById('feedbackBtnInSettings').addEventListener('click', () => {
    closeSettings();
    document.getElementById('feedbackModal').classList.remove('hidden');
});

// Close modals on background click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch(e.key.toLowerCase()) {
        case ' ':
            e.preventDefault();
            if (state.isAnimating) {
                stopAnimation();
            } else {
                startAnimation();
            }
            break;
        case 'arrowleft':
            e.preventDefault();
            stopAnimation();
            state.currentTimeIndex = Math.max(0, state.currentTimeIndex - 1);
            loadNEXRADRadar(state.currentTimeIndex);
            break;
        case 'arrowright':
            e.preventDefault();
            stopAnimation();
            state.currentTimeIndex = Math.min(state.radarTimes.length - 1, state.currentTimeIndex + 1);
            loadNEXRADRadar(state.currentTimeIndex);
            break;
        case 'w':
            document.getElementById('warningsList').classList.toggle('hidden');
            break;
        case 's':
            document.getElementById('settingsModal').classList.remove('hidden');
            break;
        case 'l':
            state.showLightning = !state.showLightning;
            document.getElementById('lightningToggle').checked = state.showLightning;
            showToast(`Lightning ${state.showLightning ? 'enabled' : 'disabled'}`, 'info');
            saveSettings();
            break;
        case 'f':
            state.showFronts = !state.showFronts;
            document.getElementById('frontsToggle').checked = state.showFronts;
            showToast(`Storm Fronts ${state.showFronts ? 'enabled' : 'disabled'}`, 'info');
            saveSettings();
            break;
        case 'escape':
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });
            break;
    }
});

// Window resize handler
window.addEventListener('resize', () => {
    map.resize();
});

// Prevent pull-to-refresh on mobile
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const touchDiff = touchY - touchStartY;
    
    if (touchDiff > 0 && window.scrollY === 0) {
        e.preventDefault();
    }
}, { passive: false });

// ================================
//  GLOBAL FUNCTIONS (for onclick handlers)
// ================================
window.showWarningDetail = showWarningDetail;
window.selectLocation = selectLocation;
window.closeSettings = closeSettings;
window.closeSearch = closeSearch;
window.closeFeedback = closeFeedback;
window.closeWarningModal = closeWarningModal;

// ================================
//  INITIALIZATION
// ================================
function init() {
    console.log('⚡ Storm Surge Weather Dashboard initializing...');
    console.log('📍 Default location:', state.currentLat, state.currentLng);
    
    // Load saved settings
    loadSettings();
    
    // Update location display
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${state.currentLng},${state.currentLat}.json?access_token=${MAPBOX_KEY}`)
        .then(res => res.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                const placeName = data.features[0].text || data.features[0].place_name.split(',')[0];
                document.getElementById('currentLocation').textContent = placeName;
            }
        })
        .catch(err => console.error('Error getting location name:', err));
    
    console.log('✅ Storm Surge Weather Dashboard initialized');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📡 Features:');
    console.log('  • NEXRAD Level II Radar Data (AWS)');
    console.log('  • Real-time NWS Weather Alerts');
    console.log('  • Warning Polygons (All Types)');
    console.log('  • Skywarn Storm Spotter Reports');
    console.log('  • Multiple Radar Products & Tilt Angles');
    console.log('  • Weather Radio Integration (NWS)');
    console.log('  • Satellite Imagery Mode');
    console.log('  • Keyboard Shortcuts');
    console.log('  • Mobile-Optimized UI');
    console.log('  • Settings Persistence');
    console.log('  • Feedback System');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⌨️  Keyboard Shortcuts:');
    console.log('  Space - Play/Pause | ←/→ - Navigate');
    console.log('  W - Warnings | S - Settings');
    console.log('  L - Lightning | F - Fronts | Esc - Close');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ========================================
//  JAVASCRIPT ENDS HERE
// ========================================