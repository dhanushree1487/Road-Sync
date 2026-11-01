/**
 * Road Sync — Report Road Hazard Form Logic
 * 
 * Manages:
 * - Exactly 5 resident-facing form fields
 * - Interactive Google Maps Platform / Tamil Nadu road location picker
 * - Damage type & severity validation
 * - Description character counter
 * - Optional photo upload, preview, validation, and removal
 * - Reset Form action (clears all 5 fields, photo, and map pin)
 * - Submission saving to PublicComplaintStore (status: PENDING)
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. TAMIL NADU ROAD REGISTRY & INTERACTIVE LOCATION PICKER
  // ==========================================================================
  const TN_LOCATIONS = [
    {
      name: 'Anna Salai (Mount Road) - Guindy',
      address: 'Anna Salai Arterial Highway, Near Guindy Flyover, Chennai, Tamil Nadu 600032',
      lat: 13.0067,
      lng: 80.2025,
      mapX: 680,
      mapY: 70
    },
    {
      name: 'Avinashi Road Corridor - Gandhipuram',
      address: 'Avinashi Road Express Flyover Ramp, Gandhipuram, Coimbatore, Tamil Nadu 641018',
      lat: 11.0168,
      lng: 76.9558,
      mapX: 140,
      mapY: 230
    },
    {
      name: 'Madurai Ring Road - Mattuthavani',
      address: 'Ring Road Bypass, Near Mattuthavani Bus Terminal, Madurai, Tamil Nadu 625007',
      lat: 9.9252,
      lng: 78.1198,
      mapX: 400,
      mapY: 270
    },
    {
      name: 'Central Junction Road - Cantonment',
      address: 'Bharathidasan Salai, Cantonment, Tiruchirappalli, Tamil Nadu 620001',
      lat: 10.7905,
      lng: 78.7047,
      mapX: 480,
      mapY: 230
    },
    {
      name: 'Bangalore Highway (NH44) - Salem Junction',
      address: 'NH44 Bangalore-Salem Bypass, Near Five Roads, Salem, Tamil Nadu 636004',
      lat: 11.6643,
      lng: 78.1460,
      mapX: 350,
      mapY: 140
    },
    {
      name: 'Old Mahabalipuram Road (OMR) - Sholinganallur',
      address: 'IT Expressway (OMR), Sholinganallur Junction, Chennai, Tamil Nadu 600119',
      lat: 12.8997,
      lng: 80.2279,
      mapX: 690,
      mapY: 80
    },
    {
      name: 'Tirunelveli South Bypass - Vannarpettai',
      address: 'Madurai Road, Vannarpettai, Tirunelveli, Tamil Nadu 627003',
      lat: 8.7139,
      lng: 77.7567,
      mapX: 420,
      mapY: 350
    },
    {
      name: 'Katpadi Main Road - Near Silk Mill',
      address: 'Katpadi Arterial Road, Vellore, Tamil Nadu 632007',
      lat: 12.9698,
      lng: 79.1325,
      mapX: 480,
      mapY: 100
    }
  ];

  // DOM Elements for Field 1 (Location)
  const mapSetupBanner = document.getElementById('mapSetupBanner');
  const mapSetupBannerText = document.getElementById('mapSetupBannerText');
  const mapSearchInput = document.getElementById('mapSearchInput');
  const btnSearchLoc = document.getElementById('btnSearchLoc');
  const mapSearchStatus = document.getElementById('mapSearchStatus');
  const leafletMapContainer = document.getElementById('leafletMap');

  const displayLocName = document.getElementById('displayLocName');
  const displayLocAddress = document.getElementById('displayLocAddress');
  const displayLocCoords = document.getElementById('displayLocCoords');
  const btnConfirmLocation = document.getElementById('btnConfirmLocation');

  const inputLocationName = document.getElementById('inputLocationName');
  const inputLocationAddress = document.getElementById('inputLocationAddress');
  const inputLocationLat = document.getElementById('inputLocationLat');
  const inputLocationLng = document.getElementById('inputLocationLng');
  const inputLocationConfirmed = document.getElementById('inputLocationConfirmed');
  const errLocation = document.getElementById('errLocation');

  let activeLocation = { ...TN_LOCATIONS[0] };
  let leafletMapInstance = null;
  let markerInstance = null;
  let lastGeocodeRequestTime = 0;
  const NOMINATIM_MIN_INTERVAL = 1000; // ms per Nominatim usage policy

  // Helper to show temporary or persistent search status messages
  function showSearchStatus(message, type = 'info', autoClearMs = 6000) {
    if (!mapSearchStatus) return;
    mapSearchStatus.style.display = 'block';
    
    let colorStyle = 'var(--color-charcoal)';
    let bgStyle = 'var(--color-surface-alt)';
    if (type === 'success') {
      colorStyle = '#155724';
      bgStyle = '#d4edda';
    } else if (type === 'warning') {
      colorStyle = '#856404';
      bgStyle = '#fff3cd';
    } else if (type === 'loading') {
      colorStyle = '#004085';
      bgStyle = '#cce5ff';
    }
    
    mapSearchStatus.style.color = colorStyle;
    mapSearchStatus.style.backgroundColor = bgStyle;
    mapSearchStatus.innerHTML = message;

    if (autoClearMs > 0) {
      setTimeout(() => {
        if (mapSearchStatus && mapSearchStatus.innerHTML === message) {
          mapSearchStatus.style.display = 'none';
        }
      }, autoClearMs);
    }
  }

  // Function to apply selected location to UI, marker, and hidden fields
  function setLocation(loc, isConfirmed = true, syncMap = false) {
    activeLocation = { ...loc };
    if (displayLocName) displayLocName.textContent = loc.name;
    if (displayLocAddress) displayLocAddress.textContent = loc.address;
    if (displayLocCoords) {
      displayLocCoords.textContent = `Coordinates: ${loc.lat.toFixed(4)}° N, ${loc.lng.toFixed(4)}° E`;
    }

    if (inputLocationName) inputLocationName.value = loc.name;
    if (inputLocationAddress) inputLocationAddress.value = loc.address;
    if (inputLocationLat) inputLocationLat.value = loc.lat.toFixed(6);
    if (inputLocationLng) inputLocationLng.value = loc.lng.toFixed(6);
    if (inputLocationConfirmed) inputLocationConfirmed.value = isConfirmed ? 'true' : 'false';

    if (errLocation) {
      errLocation.textContent = '';
      errLocation.classList.remove('is-visible');
    }

    // Sync Leaflet map & marker if requested
    if (syncMap && leafletMapInstance && markerInstance) {
      markerInstance.setLatLng([loc.lat, loc.lng]);
      leafletMapInstance.panTo([loc.lat, loc.lng]);
      markerInstance.bindPopup(`<strong>${escapeHtml(loc.name)}</strong><span>${escapeHtml(loc.address)}</span>`).openPopup();
    }
  }

  // 1A. Initialize Leaflet Map with OpenStreetMap Tiles
  function initLeafletMap() {
    if (typeof L === 'undefined') {
      console.warn('Leaflet library (L) is not yet available.');
      return;
    }

    const mapConfig = window.ROADSYNC_CONFIG?.map || {};
    const defaultCenter = [activeLocation.lat, activeLocation.lng]; // Anna Salai, Chennai [13.0067, 80.2025]
    const defaultZoom = 13;

    try {
      leafletMapInstance = L.map('leafletMap', {
        center: defaultCenter,
        zoom: defaultZoom,
        minZoom: mapConfig.minZoom || 6,
        maxZoom: mapConfig.maxZoom || 19,
        zoomControl: true
      });

      // Add base map layer: OpenFreeMap Vector Style via MapLibre GL Leaflet bridge (No API key, No billing)
      const styleUrl = mapConfig.styleUrl || 'https://tiles.openfreemap.org/styles/liberty';
      const attribution = mapConfig.attribution || '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

      let baseMapLayer = null;

      // Attempt OpenFreeMap vector layer if MapLibre GL and the Leaflet bridge are loaded
      if (typeof L.maplibreGL === 'function' && typeof maplibregl !== 'undefined') {
        try {
          baseMapLayer = L.maplibreGL({
            style: styleUrl,
            attribution: attribution,
            interactive: false
          }).addTo(leafletMapInstance);
        } catch (glError) {
          console.warn('MapLibre GL vector layer initialization failed, falling back to open raster tiles:', glError);
        }
      }

      // If MapLibre GL is unavailable or WebGL threw an error, fall back gracefully to open raster tiles
      if (!baseMapLayer) {
        const fallbackUrl = mapConfig.rasterFallbackUrl || 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
        const fallbackAttribution = mapConfig.fallbackAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; OpenStreetMap France';
        baseMapLayer = L.tileLayer(fallbackUrl, {
          maxZoom: 19,
          attribution: fallbackAttribution,
          crossOrigin: true,
          referrerPolicy: 'no-referrer-when-downgrade'
        }).addTo(leafletMapInstance);

        baseMapLayer.on('tileerror', (error) => {
          if (error.tile && !error.tile._fallbackAttempted) {
            error.tile._fallbackAttempted = true;
            if (error.tile.src.includes('openstreetmap.fr')) {
              error.tile.src = error.tile.src.replace(/tile\.openstreetmap\.fr\/osmfr/, 'tile.openstreetmap.org');
            }
          }
        });
      }

      // Custom Road Sync Pin Marker (Dark Forest Green with Amber Center and White Highlight)
      const roadSyncMarkerIcon = L.divIcon({
        className: 'roadsync-marker-wrapper',
        html: `
          <svg class="roadsync-marker-pin" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M18 0C8.06 0 0 8.06 0 18C0 30 18 44 18 44C18 44 36 30 36 18C36 8.06 27.94 0 18 0Z" fill="#183B32" stroke="#F4F0E6" stroke-width="2"/>
            <circle cx="18" cy="18" r="7" fill="#D4A56A"/>
            <circle cx="18" cy="18" r="3.5" fill="#FFFFFF"/>
          </svg>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -44]
      });

      // Create draggable marker at initial location
      markerInstance = L.marker(defaultCenter, {
        icon: roadSyncMarkerIcon,
        draggable: true,
        title: 'Drag to adjust exact road damage location'
      }).addTo(leafletMapInstance);

      // Bind initial popup
      markerInstance.bindPopup(`<strong>${escapeHtml(activeLocation.name)}</strong><span>${escapeHtml(activeLocation.address)}</span>`);

      // Event: Map Click -> Place and update marker position
      leafletMapInstance.on('click', (e) => {
        const { lat, lng } = e.latlng;
        markerInstance.setLatLng([lat, lng]);
        resolveLocation(lat, lng);
      });

      // Event: Marker Drag -> Update coordinates display live
      markerInstance.on('drag', (e) => {
        const pos = e.target.getLatLng();
        if (displayLocCoords) {
          displayLocCoords.textContent = `Coordinates: ${pos.lat.toFixed(4)}° N, ${pos.lng.toFixed(4)}° E`;
        }
        if (inputLocationLat) inputLocationLat.value = pos.lat.toFixed(6);
        if (inputLocationLng) inputLocationLng.value = pos.lng.toFixed(6);
      });

      // Event: Marker Dragend -> Resolve address and update form fields
      markerInstance.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        resolveLocation(pos.lat, pos.lng);
      });

      // Ensure proper sizing after DOM render and on window resize
      setTimeout(() => {
        leafletMapInstance.invalidateSize();
      }, 250);
      window.addEventListener('resize', () => {
        if (leafletMapInstance) leafletMapInstance.invalidateSize();
      });

    } catch (err) {
      console.error('Error initializing Leaflet map:', err);
    }
  }

  // 1B. Location Resolution via Reverse Geocoding (Adheres to Nominatim usage policies)
  async function resolveLocation(lat, lng) {
    // 1. Check local presets first for instant zero-latency match
    const preset = TN_LOCATIONS.find(loc => {
      const dLat = Math.abs(loc.lat - lat);
      const dLng = Math.abs(loc.lng - lng);
      return dLat < 0.005 && dLng < 0.005;
    });

    if (preset) {
      setLocation({
        name: preset.name,
        address: preset.address,
        lat: lat,
        lng: lng
      }, true);
      if (markerInstance) {
        markerInstance.bindPopup(`<strong>${escapeHtml(preset.name)}</strong><span>${escapeHtml(preset.address)}</span>`).openPopup();
      }
      return;
    }

    // 2. Default fallback format while resolving or if offline
    const fallbackName = `Road Location (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`;
    const fallbackAddress = `Tamil Nadu Road Corridor, Coordinates: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
    setLocation({
      name: fallbackName,
      address: fallbackAddress,
      lat: lat,
      lng: lng
    }, true);

    // 3. Reverse Geocode with Rate Limit Check (min 1000ms interval)
    const now = Date.now();
    if (now - lastGeocodeRequestTime < NOMINATIM_MIN_INTERVAL) {
      if (markerInstance) {
        markerInstance.bindPopup(`<strong>${escapeHtml(fallbackName)}</strong><span>${escapeHtml(fallbackAddress)}</span>`).openPopup();
      }
      return;
    }
    lastGeocodeRequestTime = now;

    try {
      const reverseEndpoint = window.ROADSYNC_CONFIG?.geocoding?.endpointReverse || 'https://nominatim.openstreetmap.org/reverse';
      const contactEmail = window.ROADSYNC_CONFIG?.geocoding?.contactEmail || 'roadsync.project@gmail.com';
      const reverseUrl = `${reverseEndpoint}?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&email=${encodeURIComponent(contactEmail)}`;

      const response = await fetch(reverseUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();

      if (data && data.address) {
        const addr = data.address;
        const roadName = addr.road || addr.street || addr.neighbourhood || addr.suburb || addr.hamlet || addr.village || addr.town || addr.city || 'Tamil Nadu Road';
        const locality = addr.suburb || addr.city_district || addr.city || addr.state_district || 'Tamil Nadu';
        const postcode = addr.postcode ? ` ${addr.postcode}` : '';
        const resolvedTitle = `${roadName}, ${locality}`;
        const resolvedFull = data.display_name || `${resolvedTitle}, Tamil Nadu${postcode}`;

        setLocation({
          name: resolvedTitle,
          address: resolvedFull,
          lat: lat,
          lng: lng
        }, true);

        if (markerInstance) {
          markerInstance.bindPopup(`<strong>${escapeHtml(resolvedTitle)}</strong><span>${escapeHtml(resolvedFull)}</span>`).openPopup();
        }
      }
    } catch (err) {
      if (markerInstance) {
        markerInstance.bindPopup(`<strong>${escapeHtml(fallbackName)}</strong><span>${escapeHtml(fallbackAddress)}</span>`).openPopup();
      }
    }
  }

  // 1C. On-Demand Address & Landmark Search (NO autocomplete / as-you-type querying)
  async function performSearch() {
    const rawQuery = mapSearchInput ? mapSearchInput.value.trim() : '';
    if (!rawQuery) {
      showSearchStatus('Please enter an address, road name, or landmark to search.', 'warning');
      return;
    }

    const queryLower = rawQuery.toLowerCase();

    // 1. Check local catalog first (instant, works offline, zero Nominatim load)
    const matchedPreset = TN_LOCATIONS.find(l => 
      l.name.toLowerCase().includes(queryLower) || 
      l.address.toLowerCase().includes(queryLower)
    );

    if (matchedPreset) {
      setLocation(matchedPreset, true, true);
      if (leafletMapInstance) {
        leafletMapInstance.flyTo([matchedPreset.lat, matchedPreset.lng], 15);
      }
      showSearchStatus(`Found registered hub: <strong>${escapeHtml(matchedPreset.name)}</strong>`, 'success');
      return;
    }

    // 2. Enforce Nominatim Usage Policy rate limit (1 request per second)
    const now = Date.now();
    if (now - lastGeocodeRequestTime < NOMINATIM_MIN_INTERVAL) {
      showSearchStatus('Please wait a moment before searching again (rate limit: 1 request/sec).', 'warning');
      return;
    }
    lastGeocodeRequestTime = now;

    showSearchStatus(`Searching OpenStreetMap for "<strong>${escapeHtml(rawQuery)}</strong>" across Tamil Nadu...`, 'loading', 0);

    try {
      const searchEndpoint = window.ROADSYNC_CONFIG?.geocoding?.endpointSearch || 'https://nominatim.openstreetmap.org/search';
      const contactEmail = window.ROADSYNC_CONFIG?.geocoding?.contactEmail || 'roadsync.project@gmail.com';
      const searchUrl = `${searchEndpoint}?format=json&q=${encodeURIComponent(rawQuery + ', Tamil Nadu')}&countrycodes=in&viewbox=76.23,13.55,80.35,8.08&bounded=0&limit=5&addressdetails=1&email=${encodeURIComponent(contactEmail)}`;

      const response = await fetch(searchUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const results = await response.json();

      if (results && results.length > 0) {
        const topResult = results[0];
        const resLat = parseFloat(topResult.lat);
        const resLng = parseFloat(topResult.lon);
        const addr = topResult.address || {};
        const road = addr.road || addr.street || addr.neighbourhood || addr.suburb || addr.town || addr.city || topResult.name || rawQuery;
        const locality = addr.city || addr.town || addr.state_district || 'Tamil Nadu';
        const displayTitle = `${road}, ${locality}`;
        const displayAddr = topResult.display_name;

        const newLoc = {
          name: displayTitle,
          address: displayAddr,
          lat: resLat,
          lng: resLng
        };

        setLocation(newLoc, true, true);

        if (leafletMapInstance) {
          leafletMapInstance.flyTo([resLat, resLng], 15);
        }

        showSearchStatus(`Found: <strong>${escapeHtml(displayTitle)}</strong>`, 'success');
      } else {
        showSearchStatus(`No matches found in Tamil Nadu for "<strong>${escapeHtml(rawQuery)}</strong>". You can click directly on the map to pin your location.`, 'warning');
      }
    } catch (err) {
      console.warn('Geocoding search failed:', err);
      showSearchStatus(`Unable to reach online geocoding service. You can click directly on the map or select a quick hub below.`, 'warning');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // Bind Search events ONLY on button click or Enter key (strictly no input/change event)
  if (btnSearchLoc) {
    btnSearchLoc.addEventListener('click', performSearch);
  }
  if (mapSearchInput) {
    mapSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
      }
    });
  }

  // Bind Quick Road Chips
  const roadChips = document.querySelectorAll('.quick-road-chip');
  roadChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const roadKey = chip.getAttribute('data-road');
      let matched = TN_LOCATIONS[0];
      if (roadKey === 'chennai-mount') matched = TN_LOCATIONS[0];
      else if (roadKey === 'coimbatore-avinashi') matched = TN_LOCATIONS[1];
      else if (roadKey === 'madurai-ring') matched = TN_LOCATIONS[2];
      else if (roadKey === 'trichy-junction') matched = TN_LOCATIONS[3];
      else if (roadKey === 'salem-nh44') matched = TN_LOCATIONS[4];

      setLocation(matched, true, true);
      if (leafletMapInstance) {
        leafletMapInstance.flyTo([matched.lat, matched.lng], 14);
      }
      showSearchStatus(`Selected quick hub: <strong>${escapeHtml(matched.name)}</strong>`, 'success');
    });
  });

  // Location Confirmation Button Handler
  if (btnConfirmLocation) {
    btnConfirmLocation.addEventListener('click', () => {
      if (inputLocationConfirmed) inputLocationConfirmed.value = 'true';
      if (btnConfirmLocation) {
        btnConfirmLocation.innerHTML = `
          <svg viewBox="0 0 20 20" width="14" height="14" fill="#2E7D32" aria-hidden="true">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          <span style="color: #2E7D32; font-weight: 700;">Location Confirmed</span>
        `;
        setTimeout(() => {
          btnConfirmLocation.innerHTML = `
            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <span>Confirm Location</span>
          `;
        }, 2000);
      }
    });
  }

  // Initialize Map and default location
  setLocation(TN_LOCATIONS[0], true, false);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeafletMap);
  } else {
    initLeafletMap();
  }


  // ==========================================================================
  // 2. FIELD 2: DAMAGE TYPE (Pothole, Road crack, Uneven road surface, Other)
  // ==========================================================================
  const damageTypeRadios = document.querySelectorAll('input[name="damageType"]');
  const otherTypeContainer = document.getElementById('otherTypeContainer');
  const otherTypeDetails = document.getElementById('otherTypeDetails');
  const errDamageType = document.getElementById('errDamageType');

  damageTypeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (errDamageType) {
        errDamageType.textContent = '';
        errDamageType.classList.remove('is-visible');
      }

      if (radio.value === 'Other') {
        if (otherTypeContainer) otherTypeContainer.style.display = 'block';
        if (otherTypeDetails) otherTypeDetails.focus();
      } else {
        if (otherTypeContainer) otherTypeContainer.style.display = 'none';
      }
    });
  });


  // ==========================================================================
  // 3. FIELD 3: DAMAGE SIZE AND SEVERITY
  // (Small crack or shallow pothole, Moderate damage, Large crack or deep pothole)
  // ==========================================================================
  const severityRadios = document.querySelectorAll('input[name="damageSeverity"]');
  const errSeverity = document.getElementById('errSeverity');

  severityRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (errSeverity) {
        errSeverity.textContent = '';
        errSeverity.classList.remove('is-visible');
      }
    });
  });


  // ==========================================================================
  // 4. FIELD 4: HAZARD DESCRIPTION & CHARACTER COUNTER
  // ==========================================================================
  const hazardDescription = document.getElementById('hazardDescription');
  const charCountDisplay = document.getElementById('charCountDisplay');
  const errDescription = document.getElementById('errDescription');

  if (hazardDescription) {
    hazardDescription.addEventListener('input', () => {
      const len = hazardDescription.value.length;
      if (charCountDisplay) {
        charCountDisplay.textContent = `${len} / 500 characters`;
      }
      if (len >= 15 && errDescription) {
        errDescription.textContent = '';
        errDescription.classList.remove('is-visible');
      }
    });
  }


  // ==========================================================================
  // 5. FIELD 5: SUPPORTING PHOTOGRAPH (OPTIONAL)
  // ==========================================================================
  const hazardPhotoFile = document.getElementById('hazardPhotoFile');
  const photoDropzone = document.getElementById('photoDropzone');
  const photoPreviewWrap = document.getElementById('photoPreviewWrap');
  const photoPreviewImg = document.getElementById('photoPreviewImg');
  const photoPreviewFileName = document.getElementById('photoPreviewFileName');
  const photoPreviewFileSize = document.getElementById('photoPreviewFileSize');
  const btnReplacePhoto = document.getElementById('btnReplacePhoto');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');
  const errPhoto = document.getElementById('errPhoto');

  let activePhotoDataUrl = null;

  if (photoDropzone && hazardPhotoFile) {
    photoDropzone.addEventListener('click', () => hazardPhotoFile.click());
    photoDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hazardPhotoFile.click();
      }
    });

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(name => {
      photoDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        photoDropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      photoDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        photoDropzone.classList.remove('drag-over');
      });
    });

    photoDropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processPhotoFile(files[0]);
      }
    });
  }

  if (hazardPhotoFile) {
    hazardPhotoFile.addEventListener('change', () => {
      if (hazardPhotoFile.files && hazardPhotoFile.files.length > 0) {
        processPhotoFile(hazardPhotoFile.files[0]);
      }
    });
  }

  function processPhotoFile(file) {
    if (errPhoto) {
      errPhoto.textContent = '';
      errPhoto.classList.remove('is-visible');
    }

    // Validate type (JPG, PNG, WebP)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      if (errPhoto) {
        errPhoto.textContent = 'Please select a valid image file (JPEG, PNG, or WebP).';
        errPhoto.classList.add('is-visible');
      }
      return;
    }

    // Validate size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      if (errPhoto) {
        errPhoto.textContent = 'Photograph size exceeds 5 MB. Please select a smaller image.';
        errPhoto.classList.add('is-visible');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      activePhotoDataUrl = e.target.result;
      if (photoPreviewImg) photoPreviewImg.src = activePhotoDataUrl;
      if (photoPreviewFileName) photoPreviewFileName.textContent = file.name;
      if (photoPreviewFileSize) photoPreviewFileSize.textContent = formatBytes(file.size);

      if (photoDropzone) photoDropzone.style.display = 'none';
      if (photoPreviewWrap) photoPreviewWrap.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }

  if (btnReplacePhoto && hazardPhotoFile) {
    btnReplacePhoto.addEventListener('click', () => hazardPhotoFile.click());
  }

  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener('click', clearPhoto);
  }

  function clearPhoto() {
    activePhotoDataUrl = null;
    if (hazardPhotoFile) hazardPhotoFile.value = '';
    if (photoPreviewImg) photoPreviewImg.src = '';
    if (photoDropzone) photoDropzone.style.display = 'block';
    if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
    if (errPhoto) {
      errPhoto.textContent = '';
      errPhoto.classList.remove('is-visible');
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }


  // ==========================================================================
  // 6. RESET FORM ACTION (Clears all 5 fields, photo, and map pin)
  // ==========================================================================
  const btnResetForm = document.getElementById('btnResetForm');

  function resetForm() {
    // 1. Reset Location to default
    setLocation(TN_LOCATIONS[0], true, true);
    if (mapSearchInput) mapSearchInput.value = '';
    if (mapSearchStatus) mapSearchStatus.style.display = 'none';

    // 2. Clear Damage Type
    damageTypeRadios.forEach(r => r.checked = false);
    if (otherTypeContainer) otherTypeContainer.style.display = 'none';
    if (otherTypeDetails) otherTypeDetails.value = '';

    // 3. Clear Damage Severity
    severityRadios.forEach(r => r.checked = false);

    // 4. Clear Hazard Description
    if (hazardDescription) hazardDescription.value = '';
    if (charCountDisplay) charCountDisplay.textContent = '0 / 500 characters';

    // 5. Clear Photograph
    clearPhoto();

    // Clear all error messages
    document.querySelectorAll('.field-error-text').forEach(el => {
      el.textContent = '';
      el.classList.remove('is-visible');
    });

    // Hide submission alert if open
    const successAlert = document.getElementById('submissionSuccessAlert');
    if (successAlert) successAlert.style.display = 'none';
  }

  if (btnResetForm) {
    btnResetForm.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all form fields and cleared map pin?')) {
        resetForm();
      }
    });
  }


  // ==========================================================================
  // 7. FORM SUBMISSION VALIDATION & COMPLAINT PERSISTENCE
  // ==========================================================================
  const roadComplaintForm = document.getElementById('roadComplaintForm');
  const submissionSuccessAlert = document.getElementById('submissionSuccessAlert');
  const successRefTitle = document.getElementById('successRefTitle');
  const successRefBody = document.getElementById('successRefBody');
  const btnTrackSubmittedNow = document.getElementById('btnTrackSubmittedNow');
  const dismissAlertBtn = document.getElementById('dismissAlertBtn');

  if (roadComplaintForm) {
    roadComplaintForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let isValid = true;

      // 1. Validate Location
      if (!inputLocationName.value.trim() || inputLocationConfirmed.value !== 'true') {
        if (errLocation) {
          errLocation.textContent = 'Please confirm the road location on the map before submitting.';
          errLocation.classList.add('is-visible');
        }
        isValid = false;
      }

      // 2. Validate Damage Type
      const selectedType = document.querySelector('input[name="damageType"]:checked');
      if (!selectedType) {
        if (errDamageType) {
          errDamageType.textContent = 'Please select a damage type category.';
          errDamageType.classList.add('is-visible');
        }
        isValid = false;
      }

      // 3. Validate Severity
      const selectedSeverity = document.querySelector('input[name="damageSeverity"]:checked');
      if (!selectedSeverity) {
        if (errSeverity) {
          errSeverity.textContent = 'Please select the damage size and severity level.';
          errSeverity.classList.add('is-visible');
        }
        isValid = false;
      }

      // 4. Validate Description
      const descVal = hazardDescription ? hazardDescription.value.trim() : '';
      if (!descVal || descVal.length < 15) {
        if (errDescription) {
          errDescription.textContent = 'Please describe the road hazard with at least 15 characters (e.g. lane, depth, landmark).';
          errDescription.classList.add('is-visible');
        }
        isValid = false;
      }

      if (!isValid) {
        const firstErr = document.querySelector('.field-error-text.is-visible');
        if (firstErr) {
          firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // Build Complaint Object aligned with Main.java models
      const refNumber = `RS-2026-${String(Math.floor(100 + Math.random() * 900))}`;
      let finalDamageType = selectedType.value;
      if (finalDamageType === 'Other' && otherTypeDetails?.value.trim()) {
        finalDamageType = `Other (${otherTypeDetails.value.trim()})`;
      }

      const severityRank = parseInt(selectedSeverity.getAttribute('data-rank') || '2', 10);
      const todayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newComplaint = {
        id: refNumber,
        refNo: refNumber,
        location: inputLocationName.value.trim(),
        address: inputLocationAddress.value.trim(),
        lat: parseFloat(inputLocationLat.value) || 13.0067,
        lng: parseFloat(inputLocationLng.value) || 80.2025,
        coords: `${parseFloat(inputLocationLat.value).toFixed(4)}° N, ${parseFloat(inputLocationLng.value).toFixed(4)}° E`,
        type: finalDamageType,
        severity: selectedSeverity.value,
        severityLevel: severityRank,
        date: todayDate,
        status: 'PENDING',
        statusLabel: 'Pending Municipal Review',
        progressNote: 'Complaint registered in resident portal. Awaiting operator triage & priority ranking.',
        description: descVal,
        photoPreview: activePhotoDataUrl,
        isDemo: false,
        equipment: finalDamageType.includes('Pothole') ? ['JACKHAMMER', 'ASPHALT_MIXER'] : ['PAVER', 'ROAD_ROLLER'],
        assignedTeam: 'Unassigned (Awaiting Operator Triage)',
        estimatedTime: `${30 + severityRank * 15} minutes (Estimated)`,
        history: [
          {
            stage: 'REPORTED',
            title: 'Complaint Registered',
            date: `${todayDate} ${timeStr}`,
            note: 'Citizen report submitted with road coordinates and description.'
          }
        ]
      };

      // Save to Authoritative Java Backend
      const btnSubmit = document.getElementById('btnSubmitReport');
      const origBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span>Submitting to Municipal Server...</span>';
      }

      try {
        let created;
        if (typeof ApiClient !== 'undefined') {
          created = await ApiClient.submitComplaint(newComplaint);
          const list = PublicComplaintStore.getAll();
          list.unshift(created);
          PublicComplaintStore.save(list);
        } else {
          throw new Error('ApiClient is not available. Backend server connection required.');
        }

        const finalRef = created?.id || created?.refNo || refNumber;

        // Save submission confirmation toast for the dashboard
        try {
          sessionStorage.setItem('roadsync_toast_message', JSON.stringify({
            refNo: finalRef,
            location: newComplaint.location,
            type: newComplaint.type
          }));
        } catch (err) {}

        // Return user to the Public User dashboard (requirement 8)
        window.location.href = `dashboard-public.html?submitted=${encodeURIComponent(finalRef)}`;
      } catch (submitErr) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origBtnHtml;
        }
        alert('Complaint Submission Failed: ' + submitErr.message);
      }
    });
  }

  if (dismissAlertBtn && submissionSuccessAlert) {
    dismissAlertBtn.addEventListener('click', () => {
      submissionSuccessAlert.style.display = 'none';
    });
  }

});
