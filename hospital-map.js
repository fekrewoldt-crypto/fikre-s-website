/**
 * MediScan - Gondar Hospital Map Module
 * Interactive Leaflet.js map for healthcare facilities in Gondar and Azezo
 */

// Hospital data will be loaded from JSON
let hospitalData = [];
let map = null;
let markers = [];
let userLocation = null;
let activeFilter = 'all';
let searchQuery = '';

// Icon configurations for different facility types
const facilityIcons = {
  hospital: {
    color: '#c0392b',
    icon: '🏥',
    label: 'Hospital'
  },
  health_center: {
    color: '#f39c12',
    icon: '🏨',
    label: 'Health Center'
  },
  clinic: {
    color: '#3498db',
    icon: '🩺',
    label: 'Clinic'
  },
  pharmacy: {
    color: '#27ae60',
    icon: '💊',
    label: 'Pharmacy'
  }
};

/**
 * Initialize the hospital map
 */
async function initHospitalMap() {
  try {
    console.log('Initializing hospital map...');

    // Show loading state
    const container = document.getElementById('hospital-map-container');
    if (container) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);">Loading map...</div>';
    }

    // Load hospital data
    await loadHospitalData();

    // Create map centered on Gondar
    createMap();

    // Add markers to map
    renderMarkers();

    // Setup event listeners
    setupEventListeners();

    console.log('Hospital map initialized successfully');
  } catch (error) {
    console.error('Failed to initialize hospital map:', error);
    showToast('Failed to load hospital map. Please refresh the page.', 'error');
  }
}

/**
 * Load hospital data from JSON file
 */
async function loadHospitalData() {
  try {
    const response = await fetch('hospitals-gondar.json');
    if (!response.ok) throw new Error('Failed to load hospital data');
    hospitalData = await response.json();
    console.log(`Loaded ${hospitalData.length} healthcare facilities`);
  } catch (error) {
    console.error('Error loading hospital data:', error);
    // Fallback to embedded data if fetch fails
    hospitalData = getEmbeddedHospitalData();
  }
}

/**
 * Embedded hospital data as fallback
 */
function getEmbeddedHospitalData() {
  return [
    {
      "id": "gondar_001",
      "name": "University of Gondar Comprehensive Specialized Hospital",
      "type": "hospital",
      "address": "Maraki Street, Near Atse Tewodros Square, Gondar",
      "phone": "+251 58 114 1232",
      "hours": "24/7",
      "services": ["Emergency", "Surgery", "Internal Medicine", "Pediatrics", "Lab", "Radiology", "Pharmacy", "ICU", "Maternity"],
      "lat": 12.6089,
      "lng": 37.4671,
      "notes": "Largest referral hospital in the region",
      "verified": true
    },
    {
      "id": "gondar_002",
      "name": "Felege Hiwot Referral Hospital",
      "type": "hospital",
      "address": "City Center, Gondar",
      "phone": "+251 581 114 000",
      "hours": "24/7",
      "services": ["Emergency", "General Medicine", "Maternity", "Lab", "Surgery"],
      "lat": 12.6050,
      "lng": 37.4650,
      "notes": "Well-equipped emergency department",
      "verified": true
    },
    {
      "id": "azezo_001",
      "name": "Azezo Hospital",
      "type": "hospital",
      "address": "Azezo area, ~10km from Gondar",
      "phone": "+251 581 111 111",
      "hours": "24/7",
      "services": ["Emergency", "Surgery", "General Medicine", "Lab"],
      "lat": 12.5200,
      "lng": 37.4500,
      "notes": "Secondary referral center",
      "verified": true
    },
    {
      "id": "gondar_003",
      "name": "St. Mary's Catholic Hospital",
      "type": "hospital",
      "address": "Near Kidus Giorgis Church, Gondar",
      "phone": "+251 581 141 292",
      "hours": "24/7",
      "services": ["Emergency", "General Medicine", "Surgery", "Maternity"],
      "lat": 12.6020,
      "lng": 37.4680,
      "notes": "Faith-based hospital with good reputation",
      "verified": true
    },
    {
      "id": "gondar_004",
      "name": "Ibex Hospital",
      "type": "hospital",
      "address": "Yohannis Church area, Gondar",
      "phone": "+251 58 111 8273",
      "hours": "24/7",
      "services": ["Emergency", "General Medicine", "Surgery", "Lab"],
      "lat": 12.6100,
      "lng": 37.4700,
      "notes": "Private hospital with modern facilities",
      "verified": true
    },
    {
      "id": "gondar_007",
      "name": "Kebele 14 Health Center",
      "type": "health_center",
      "address": "Kebele 14, Gondar",
      "phone": "+251 581 112 345",
      "hours": "8:00 AM - 6:00 PM",
      "services": ["Primary Care", "Family Planning", "Vaccination", "Lab"],
      "lat": 12.6120,
      "lng": 37.4650,
      "notes": "Public health center",
      "verified": true
    },
    {
      "id": "gondar_010",
      "name": "Azezo Health Center",
      "type": "health_center",
      "address": "Kebele 20, Azezo, Gondar",
      "phone": "+251 581 115 678",
      "hours": "8:00 AM - 6:00 PM",
      "services": ["Primary Care", "Family Planning", "Vaccination", "Lab"],
      "lat": 12.5250,
      "lng": 37.4550,
      "notes": "Serves ~69,000 people",
      "verified": true
    },
    {
      "id": "gondar_012",
      "name": "Dr. Endalkachew ENT Clinic",
      "type": "clinic",
      "address": "Maraki area, Gondar",
      "phone": "+251 93 570 4444",
      "hours": "9:00 AM - 5:00 PM (Mon-Sat)",
      "services": ["ENT Specialist", "Hearing Tests"],
      "lat": 12.6085,
      "lng": 37.4680,
      "notes": "Specialized ENT clinic",
      "verified": true
    },
    {
      "id": "gondar_022",
      "name": "University of Gondar Emergency Pharmacy",
      "type": "pharmacy",
      "address": "Maraki Street, UoG Hospital Compound",
      "phone": "+251 581 141 232",
      "hours": "24/7",
      "services": ["Prescription Medications", "Emergency Medications"],
      "lat": 12.6091,
      "lng": 37.4673,
      "notes": "Main 24-hour emergency pharmacy",
      "verified": true
    },
    {
      "id": "gondar_023",
      "name": "Goha Pharmacy",
      "type": "pharmacy",
      "address": "Arada Piazza, Gondar",
      "phone": "+251 930 110 942",
      "hours": "8:00 AM - 10:00 PM",
      "services": ["Prescription Medications", "OTC Drugs"],
      "lat": 12.6045,
      "lng": 37.4655,
      "notes": "Well-stocked pharmacy",
      "verified": true
    }
  ];
}

/**
 * Create the Leaflet map
 */
function createMap() {
  // Remove existing map if any
  const existingMap = document.getElementById('hospital-map-container');
  if (existingMap) {
    existingMap.innerHTML = '';
  }

  // Ensure the container has a height before creating the map
  const container = document.getElementById('hospital-map-container');
  if (container) {
    container.style.height = '500px';
    container.style.width = '100%';
  }

  // Create map centered on Gondar (12.6°N, 37.47°E)
  map = L.map('hospital-map-container', {
    zoomControl: true,
    attributionControl: true
  }).setView([12.6089, 37.4671], 14);

  // Add OpenStreetMap tiles (free, no API key required)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Add scale control
  L.control.scale({
    imperial: false,
    metric: true,
    position: 'bottomright'
  }).addTo(map);

  console.log('Map created successfully');
}

/**
 * Create custom div icon for facilities
 */
function createFacilityIcon(facility) {
  const iconConfig = facilityIcons[facility.type] || facilityIcons.clinic;

  return L.divIcon({
    className: 'facility-marker',
    html: `
      <div class="marker-pin" style="background-color: ${iconConfig.color}">
        <span class="marker-icon">${iconConfig.icon}</span>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40]
  });
}

/**
 * Render all markers on the map
 */
function renderMarkers() {
  // Clear existing markers
  markers.forEach(marker => marker.remove());
  markers = [];

  // Filter facilities
  const filtered = getFilteredFacilities();

  // Add markers for each facility
  filtered.forEach(facility => {
    const marker = L.marker([facility.lat, facility.lng], {
      icon: createFacilityIcon(facility)
    }).addTo(map);

    // Create popup content
    const popupContent = createPopupContent(facility);
    marker.bindPopup(popupContent, {
      maxWidth: 320,
      className: 'facility-popup'
    });

    // Store facility data with marker
    marker.facilityData = facility;
    markers.push(marker);
  });

  // Update list view
  renderFacilityList(filtered);
}

/**
 * Get filtered facilities based on current filter and search
 */
function getFilteredFacilities() {
  return hospitalData.filter(facility => {
    // Type filter
    if (activeFilter !== 'all' && facility.type !== activeFilter) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchable = `${facility.name} ${facility.address} ${facility.services.join(' ')}`.toLowerCase();
      if (!searchable.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Create popup content for a facility
 */
function createPopupContent(facility) {
  const iconConfig = facilityIcons[facility.type] || facilityIcons.clinic;
  const is24Hour = facility.hours.toLowerCase().includes('24');

  return `
    <div class="facility-popup-content">
      <div class="popup-header">
        <span class="popup-icon">${iconConfig.icon}</span>
        <div class="popup-title">
          <h3>${facility.name}</h3>
          <span class="popup-type" style="color: ${iconConfig.color}">${iconConfig.label}</span>
        </div>
      </div>

      <div class="popup-info">
        ${facility.address ? `<div class="info-row"><span class="info-icon">📍</span><span>${facility.address}</span></div>` : ''}
        ${facility.phone ? `<div class="info-row"><span class="info-icon">📞</span><a href="tel:${facility.phone.replace(/\s/g, '')}">${facility.phone}</a></div>` : ''}
        ${facility.hours ? `<div class="info-row"><span class="info-icon">🕐</span><span class="${is24Hour ? 'hours-247' : ''}">${facility.hours}</span></div>` : ''}
      </div>

      ${facility.services && facility.services.length > 0 ? `
        <div class="popup-services">
          <strong>Services:</strong>
          <div class="services-tags">
            ${facility.services.slice(0, 5).map(s => `<span class="service-tag">${s}</span>`).join('')}
            ${facility.services.length > 5 ? `<span class="service-tag more">+${facility.services.length - 5}</span>` : ''}
          </div>
        </div>
      ` : ''}

      ${facility.notes ? `<div class="popup-notes">ℹ️ ${facility.notes}</div>` : ''}

      <div class="popup-actions">
        <a href="tel:${facility.phone.replace(/\s/g, '')}" class="action-btn call-btn">
          📞 Call
        </a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}"
           target="_blank"
           rel="noopener noreferrer"
           class="action-btn directions-btn">
          🗺️ Directions
        </a>
      </div>
    </div>
  `;
}

/**
 * Render facility list view
 */
function renderFacilityList(facilities) {
  const listContainer = document.getElementById('facility-list');
  if (!listContainer) return;

  if (facilities.length === 0) {
    listContainer.innerHTML = `
      <div class="facility-list-empty">
        <span class="empty-icon">🔍</span>
        <p>No facilities found matching your criteria.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = facilities.map(facility => {
    const iconConfig = facilityIcons[facility.type] || facilityIcons.clinic;
    const is24Hour = facility.hours.toLowerCase().includes('24');

    return `
      <div class="facility-list-item" data-id="${facility.id}" data-lat="${facility.lat}" data-lng="${facility.lng}">
        <div class="facility-list-icon" style="background-color: ${iconConfig.color}">
          ${iconConfig.icon}
        </div>
        <div class="facility-list-info">
          <h4>${facility.name}</h4>
          <div class="facility-list-meta">
            <span class="facility-type">${iconConfig.label}</span>
            ${is24Hour ? '<span class="badge-247">24/7</span>' : ''}
          </div>
          <div class="facility-list-details">
            <span>📍 ${facility.address || 'Address not available'}</span>
            ${facility.phone ? `<span>📞 ${facility.phone}</span>` : ''}
          </div>
          ${facility.services && facility.services.length > 0 ? `
            <div class="facility-list-services">
              ${facility.services.slice(0, 3).join(', ')}
              ${facility.services.length > 3 ? ` +${facility.services.length - 3}` : ''}
            </div>
          ` : ''}
        </div>
        <div class="facility-list-actions">
          <a href="tel:${facility.phone.replace(/\s/g, '')}" class="list-action-btn">📞</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}"
             target="_blank"
             rel="noopener noreferrer"
             class="list-action-btn">🗺️</a>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for list items
  listContainer.querySelectorAll('.facility-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.list-action-btn')) {
        const lat = parseFloat(item.dataset.lat);
        const lng = parseFloat(item.dataset.lng);
        map.setView([lat, lng], 16);

        // Find and open corresponding marker popup
        const marker = markers.find(m =>
          m.facilityData && m.facilityData.lat === lat && m.facilityData.lng === lng
        );
        if (marker) {
          marker.openPopup();
        }
      }
    });
  });
}

/**
 * Setup event listeners for filters and controls
 */
function setupEventListeners() {
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderMarkers();
    });
  });

  // Search input
  const searchInput = document.getElementById('facility-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderMarkers();
    });
  }

  // View toggle (map/list)
  const viewToggle = document.getElementById('view-toggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', () => {
      const mapContainer = document.getElementById('map-view');
      const listContainer = document.getElementById('list-view');

      if (mapContainer.style.display !== 'none') {
        mapContainer.style.display = 'none';
        listContainer.style.display = 'block';
        viewToggle.textContent = '📍 Map View';
        viewToggle.classList.add('list-active');
      } else {
        mapContainer.style.display = 'block';
        listContainer.style.display = 'none';
        viewToggle.textContent = '📋 List View';
        viewToggle.classList.remove('list-active');
        // Invalidate map size when showing again
        setTimeout(() => map.invalidateSize(), 100);
      }
    });
  }

  // Near Me button
  const nearMeBtn = document.getElementById('near-me-btn');
  if (nearMeBtn) {
    nearMeBtn.addEventListener('click', findNearestFacility);
  }

  // Emergency banner close
  const emergencyClose = document.getElementById('emergency-close');
  if (emergencyClose) {
    emergencyClose.addEventListener('click', () => {
      document.getElementById('emergency-banner').style.display = 'none';
    });
  }
}

/**
 * Find nearest facility using browser geolocation
 */
function findNearestFacility() {
  const btn = document.getElementById('near-me-btn');

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '📍 Locating...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      // Add user location marker
      addUserLocationMarker();

      // Calculate distances and find nearest
      const facilitiesWithDistance = hospitalData.map(f => ({
        ...f,
        distance: calculateDistance(userLocation.lat, userLocation.lng, f.lat, f.lng)
      }));

      facilitiesWithDistance.sort((a, b) => a.distance - b.distance);

      // Show nearest facilities
      const nearest = facilitiesWithDistance.slice(0, 5);

      // Update list with distances
      nearest.forEach(f => {
        f.distanceText = formatDistance(f.distance);
      });

      renderMarkers();
      renderFacilityList(nearest);

      // Zoom to show user location and nearest facilities
      const bounds = [
        [userLocation.lat, userLocation.lng],
        [nearest[0].lat, nearest[0].lng]
      ];
      map.fitBounds(bounds, { padding: [50, 50] });

      btn.textContent = '✓ Your Location';
      btn.classList.add('success');

      showToast(`Found ${nearest.length} nearby facilities`, 'success');
    },
    (error) => {
      btn.disabled = false;
      btn.textContent = '📍 Find Nearest';

      let errorMsg = 'Unable to get your location.';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg += ' Please enable location permissions.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg += ' Location information unavailable.';
          break;
        case error.TIMEOUT:
          errorMsg += ' Location request timed out.';
          break;
      }

      showToast(errorMsg, 'error');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

/**
 * Add user location marker to map
 */
function addUserLocationMarker() {
  // Remove existing user location marker
  if (map.userMarker) {
    map.userMarker.remove();
  }

  // Add pulsing marker for user location
  const userIcon = L.divIcon({
    className: 'user-location-marker',
    html: `
      <div class="user-location-pulse">
        <div class="user-location-dot"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  map.userMarker = L.marker([userLocation.lat, userLocation.lng], {
    icon: userIcon
  }).addTo(map);

  map.userMarker.bindPopup('<strong>Your Location</strong>').openPopup();
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRad(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Format distance for display
 */
function formatDistance(km) {
  if (km < 1) {
    return Math.round(km * 1000) + ' m';
  }
  return km.toFixed(1) + ' km';
}

/**
 * Show facility details in modal
 */
function showFacilityModal(facilityId) {
  const facility = hospitalData.find(f => f.id === facilityId);
  if (!facility) return;

  const modal = document.getElementById('facility-detail-modal');
  const content = document.getElementById('facility-detail-content');

  if (content) {
    content.innerHTML = createPopupContent(facility);
  }

  if (modal) {
    modal.classList.add('open');
  }
}

/**
 * Close facility detail modal
 */
function closeFacilityModal() {
  const modal = document.getElementById('facility-detail-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

/**
 * Highlight facilities matching a search term
 */
function highlightFacilities(searchTerm) {
  searchQuery = searchTerm;
  const searchInput = document.getElementById('facility-search');
  if (searchInput) {
    searchInput.value = searchTerm;
  }
  renderMarkers();
}

/**
 * Reset map to default view
 */
function resetMapView() {
  map.setView([12.6089, 37.4671], 14);
  activeFilter = 'all';
  searchQuery = '';

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');

  const searchInput = document.getElementById('facility-search');
  if (searchInput) {
    searchInput.value = '';
  }

  const nearMeBtn = document.getElementById('near-me-btn');
  if (nearMeBtn) {
    nearMeBtn.textContent = '📍 Find Nearest';
    nearMeBtn.classList.remove('success');
    nearMeBtn.disabled = false;
  }

  renderMarkers();
}

/**
 * Show hospitals for emergency (called from main app)
 */
function showEmergencyHospitals() {
  // Filter to only hospitals
  activeFilter = 'hospital';
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'hospital');
  });

  renderMarkers();

  // Show the facilities page
  if (typeof showPage === 'function') {
    showPage('facilities', document.querySelector('.nav-tab[data-page="facilities"]'));
  }

  showToast('Showing emergency hospitals. Call 907 for ambulance.', 'info', 5000);
}

/**
 * Initialize when the facilities page is shown
 */
function onFacilitiesPageShow() {
  console.log('Facilities page shown, initializing map...');

  // Check if the container exists
  const container = document.getElementById('hospital-map-container');
  if (!container) {
    console.error('Hospital map container not found!');
    return;
  }

  console.log('Container found, dimensions:', {
    width: container.offsetWidth,
    height: container.offsetHeight,
    display: window.getComputedStyle(container).display
  });

  // Small delay to ensure the page is fully visible
  setTimeout(() => {
    if (!map) {
      console.log('Map not initialized, creating new map...');
      initHospitalMap();
    } else {
      console.log('Map already exists, invalidating size...');
      map.invalidateSize();

      // Re-render markers to ensure they're visible
      renderMarkers();
    }
  }, 200);
}

// Export functions for global access
window.initHospitalMap = initHospitalMap;
window.onFacilitiesPageShow = onFacilitiesPageShow;
window.showEmergencyHospitals = showEmergencyHospitals;
window.resetMapView = resetMapView;
window.highlightFacilities = highlightFacilities;
window.showFacilityModal = showFacilityModal;
window.closeFacilityModal = closeFacilityModal;
