// App styling import for Vite bundler
import './styles.css';
import { translations } from './translations.js';

// Database configurations
const DB_NAME = 'DogBoardingHotelDB';
const DB_VERSION = 1;
let db = null;

// Application State
const state = {
  currentView: 'home', // 'home' | 'add' | 'details'
  activeDogId: null,
  dogs: [],
  photos: [],
  searchQuery: '',
  sortBy: 'date-desc', // 'date-desc' | 'date-asc' | 'name-asc'
  language: localStorage.getItem('pawpal_language') || 'en' // Default language
};

// ==========================================
// 1. INDEXEDDB DATABASE ENGINE
// ==========================================

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      
      // Store for dog profiles
      if (!dbInstance.objectStoreNames.contains('dogs')) {
        dbInstance.createObjectStore('dogs', { keyPath: 'id' });
      }
      
      // Store for photos with dogId index
      if (!dbInstance.objectStoreNames.contains('photos')) {
        const photoStore = dbInstance.createObjectStore('photos', { keyPath: 'id' });
        photoStore.createIndex('dogId', 'dogId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('IndexedDB initialized successfully.');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB failed to open:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Promise-based wrappers for Database Operations
const dbOps = {
  // Get all dogs
  getAllDogs() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['dogs'], 'readonly');
      const store = transaction.objectStore('dogs');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  // Get a single dog by ID
  getDog(id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['dogs'], 'readonly');
      const store = transaction.objectStore('dogs');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // Add or Update a dog
  saveDog(dog) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['dogs'], 'readwrite');
      const store = transaction.objectStore('dogs');
      const request = store.put(dog);

      request.onsuccess = () => resolve(dog);
      request.onerror = () => reject(request.error);
    });
  },

  // Delete a dog and all its photos
  deleteDog(id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['dogs', 'photos'], 'readwrite');
      
      // 1. Delete dog profile
      transaction.objectStore('dogs').delete(id);
      
      // 2. Delete dog photos from photos store
      const photoStore = transaction.objectStore('photos');
      const index = photoStore.index('dogId');
      const request = index.openCursor(IDBKeyRange.only(id));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        resolve(true);
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  },

  // Get photos for a specific dog
  getPhotosByDog(dogId) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['photos'], 'readonly');
      const store = transaction.objectStore('photos');
      const index = store.index('dogId');
      const request = index.getAll(IDBKeyRange.only(dogId));

      request.onsuccess = () => {
        // Sort photos by timestamp descending
        const results = request.result || [];
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Save a photo record
  savePhoto(photo) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['photos'], 'readwrite');
      const store = transaction.objectStore('photos');
      const request = store.put(photo);

      request.onsuccess = () => resolve(photo);
      request.onerror = () => reject(request.error);
    });
  },

  // Delete a photo by ID
  deletePhoto(id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['photos'], 'readwrite');
      const store = transaction.objectStore('photos');
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Display custom bottom toast alerts
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const bgColor = type === 'success' ? 'bg-pink-500' : 'bg-red-600';
  toast.className = `${bgColor} text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-sm w-11/12 text-sm font-medium transition-all duration-300 transform translate-y-10 opacity-0`;
  
  // Custom icons inside toasts
  const icon = type === 'success' 
    ? `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`
    : `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;

  toast.innerHTML = `${icon}<span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animations
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  // Remove toast after duration
  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// Convert files into compressed base64 strings utilizing HTML Canvas
function compressImage(file, maxWidth = 1024, maxHeight = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate responsive dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // JPEG format with 75% quality offers best quality-to-size ratio for storage
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Format timestamp to localized readable dates
function formatDate(timestamp) {
  const date = new Date(Number(timestamp));
  if (state.language === 'de') {
    return date.toLocaleDateString('de-DE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (state.language === 'th') {
    return date.toLocaleDateString('th-TH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// Helper to determine time elapsed since boarding
function getTimeElapsed(timestamp) {
  const diffMs = Date.now() - Number(timestamp);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (state.language === 'de') {
    if (diffDays > 0) {
      return `vor ${diffDays}T ${diffHours % 24}Std`;
    } else if (diffHours > 0) {
      return `vor ${diffHours}Std ${diffMins % 60}Min`;
    } else {
      return `vor ${Math.max(1, diffMins)}Min`;
    }
  } else if (state.language === 'th') {
    if (diffDays > 0) {
      return `${diffDays} วัน ${diffHours % 24} ชม. ที่แล้ว`;
    } else if (diffHours > 0) {
      return `${diffHours} ชม. ${diffMins % 60} นาที ที่แล้ว`;
    } else {
      return `${Math.max(1, diffMins)} นาที ที่แล้ว`;
    }
  } else {
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m ago`;
    } else {
      return `${Math.max(1, diffMins)}m ago`;
    }
  }
}

// ==========================================
// TRANSLATION ENGINE & LANGUAGE BINDINGS
// ==========================================

function t(key, params = {}) {
  const dict = translations[state.language] || translations['en'];
  let text = dict[key] || translations['en'][key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`{${k}}`, 'g'), v);
  }
  return text;
}

function updateLanguageDOM() {
  const downloadZipText = document.getElementById('download-zip-text');
  if (downloadZipText) downloadZipText.textContent = t('download_zip');

  const headerSubtitle = document.getElementById('header-subtitle');
  if (headerSubtitle) headerSubtitle.textContent = t('subtitle');

  const headerLiveText = document.getElementById('header-live-text');
  if (headerLiveText) headerLiveText.textContent = t('live');

  // Home Screen View Elements
  const occupancyTitle = document.getElementById('occupancy-title');
  if (occupancyTitle) occupancyTitle.textContent = t('occupancy_title');

  const occupancyDesc = document.getElementById('occupancy-desc');
  if (occupancyDesc) occupancyDesc.textContent = t('occupancy_desc');

  const statTotalLabel = document.getElementById('stat-total-label');
  if (statTotalLabel) statTotalLabel.textContent = t('checked_in');

  const statTodayLabel = document.getElementById('stat-today-label');
  if (statTodayLabel) statTodayLabel.textContent = t('new_today');

  // Search input placeholder
  const searchInput = document.getElementById('search-dogs');
  if (searchInput) searchInput.placeholder = t('search_placeholder');

  // Sort dropdown options
  const sortNewest = document.getElementById('sort-option-newest');
  if (sortNewest) sortNewest.textContent = t('sort_newest');

  const sortOldest = document.getElementById('sort-option-oldest');
  if (sortOldest) sortOldest.textContent = t('sort_oldest');

  const sortName = document.getElementById('sort-option-name');
  if (sortName) sortName.textContent = t('sort_name');

  // Form Screen Elements
  const formSubtitle = document.getElementById('form-subtitle');
  if (formSubtitle) formSubtitle.textContent = t('form_subtitle');

  const labelDogName = document.getElementById('label-dog-name');
  if (labelDogName) labelDogName.textContent = t('label_dog_name');

  const inputDogName = document.getElementById('dog-name');
  if (inputDogName) inputDogName.placeholder = t('placeholder_dog_name');

  const labelOwnerName = document.getElementById('label-owner-name');
  if (labelOwnerName) labelOwnerName.textContent = t('label_owner_name');

  const inputOwnerName = document.getElementById('owner-name');
  if (inputOwnerName) inputOwnerName.placeholder = t('placeholder_owner_name');

  const labelDogRoom = document.getElementById('label-dog-room');
  if (labelDogRoom) labelDogRoom.textContent = t('label_room');

  const inputDogRoom = document.getElementById('dog-room');
  if (inputDogRoom) inputDogRoom.placeholder = t('placeholder_room');

  const labelDogTag = document.getElementById('label-dog-tag');
  if (labelDogTag) labelDogTag.textContent = t('label_care_priority');

  const optCareStandard = document.getElementById('opt-care-standard');
  if (optCareStandard) optCareStandard.textContent = t('care_standard');

  const optCareDiet = document.getElementById('opt-care-diet');
  if (optCareDiet) optCareDiet.textContent = t('care_diet');

  const optCareMeds = document.getElementById('opt-care-meds');
  if (optCareMeds) optCareMeds.textContent = t('care_meds');

  const optCareActive = document.getElementById('opt-care-active');
  if (optCareActive) optCareActive.textContent = t('care_active');

  const labelDogItems = document.getElementById('label-dog-items');
  if (labelDogItems) labelDogItems.textContent = t('label_luggage');

  const inputDogItems = document.getElementById('dog-items');
  if (inputDogItems) inputDogItems.placeholder = t('placeholder_items');

  const itemsInstruction = document.getElementById('items-instruction');
  if (itemsInstruction) itemsInstruction.textContent = t('items_instruction');

  const cancelBtnText = document.getElementById('cancel-btn-text');
  if (cancelBtnText) cancelBtnText.textContent = t('btn_cancel');

  const dogForm = document.getElementById('dog-form');
  if (dogForm) {
    const isEditMode = dogForm.dataset.editMode === 'true';
    const formViewTitle = document.getElementById('form-view-title');
    const submitBtnText = document.getElementById('submit-btn-text');
    if (isEditMode) {
      const dogName = inputDogName ? inputDogName.value.trim() : '';
      if (formViewTitle) formViewTitle.textContent = t('form_edit_title', { name: dogName });
      if (submitBtnText) submitBtnText.textContent = t('btn_save_changes');
    } else {
      if (formViewTitle) formViewTitle.textContent = t('form_new_title');
      if (submitBtnText) submitBtnText.textContent = t('btn_complete_checkin');
    }
  }

  // Details Screen Elements
  const labelDetailOwnerPrefix = document.getElementById('label-detail-owner-prefix');
  if (labelDetailOwnerPrefix) labelDetailOwnerPrefix.textContent = t('label_owner_name') + ':';

  const labelDetailRoom = document.getElementById('label-detail-room');
  if (labelDetailRoom) labelDetailRoom.textContent = t('detail_room_label');

  const labelDetailStay = document.getElementById('label-detail-stay');
  if (labelDetailStay) labelDetailStay.textContent = t('detail_time_label');

  const labelDetailTimestamp = document.getElementById('label-detail-timestamp');
  if (labelDetailTimestamp) labelDetailTimestamp.textContent = t('detail_timestamp_label');

  const labelDetailLuggage = document.getElementById('label-detail-luggage');
  if (labelDetailLuggage) labelDetailLuggage.textContent = t('detail_luggage_title');

  const labelDetailPhoto = document.getElementById('label-detail-photo');
  if (labelDetailPhoto) labelDetailPhoto.textContent = t('detail_photo_diary');

  const labelDetailSnapsText = document.getElementById('label-detail-snaps-text');
  if (labelDetailSnapsText) labelDetailSnapsText.textContent = t('detail_snaps');

  const cameraTriggerCardText = document.getElementById('camera-trigger-card-text');
  if (cameraTriggerCardText) cameraTriggerCardText.textContent = t('detail_snap_photo');

  const checkoutBtnText = document.getElementById('checkout-btn-text');
  if (checkoutBtnText) checkoutBtnText.textContent = t('detail_checkout_btn');

  // Desktop side highlights
  const pwaTitle = document.getElementById('pwa-title');
  if (pwaTitle) pwaTitle.textContent = t('pwa_title');

  const pwaDesc = document.getElementById('pwa-desc');
  if (pwaDesc) pwaDesc.textContent = t('pwa_desc');

  const intakeTitle = document.getElementById('intake-title');
  if (intakeTitle) intakeTitle.textContent = t('intake_title');

  const intakeDesc = document.getElementById('intake-desc');
  if (intakeDesc) intakeDesc.textContent = t('intake_desc');

  const cameraTitle = document.getElementById('camera-title');
  if (cameraTitle) cameraTitle.textContent = t('camera_title');

  const cameraSubtitle = document.getElementById('camera-subtitle');
  if (cameraSubtitle) cameraSubtitle.textContent = t('camera_subtitle');

  const cameraDesc = document.getElementById('camera-desc');
  if (cameraDesc) cameraDesc.textContent = t('camera_desc');

  const lightboxDeleteBtnText = document.getElementById('lightbox-delete-btn-text');
  if (lightboxDeleteBtnText) lightboxDeleteBtnText.textContent = t('lightbox_delete_btn_text');

  const exportBtnText = document.getElementById('export-btn-text');
  if (exportBtnText) exportBtnText.textContent = t('export_btn_text');

  const shareBtnText = document.getElementById('share-btn-text');
  if (shareBtnText) shareBtnText.textContent = t('share_btn_text');

  const mediaSheetTitle = document.getElementById('media-sheet-title');
  if (mediaSheetTitle) mediaSheetTitle.textContent = t('media_sheet_title');

  const mediaSheetDesc = document.getElementById('media-sheet-desc');
  if (mediaSheetDesc) mediaSheetDesc.textContent = t('media_sheet_desc');

  const optionAddPhotoText = document.getElementById('option-add-photo-text');
  if (optionAddPhotoText) optionAddPhotoText.textContent = t('option_add_photo_text');

  const optionAddVideoText = document.getElementById('option-add-video-text');
  if (optionAddVideoText) optionAddVideoText.textContent = t('option_add_video_text');
}

// ==========================================
// 3. UI VIEW ROUTER / MANAGER
// ==========================================

function navigateTo(viewName, dogId = null) {
  state.currentView = viewName;
  state.activeDogId = dogId;

  // Hide all screens
  document.querySelectorAll('.view').forEach((el) => {
    el.classList.add('hidden');
  });

  // Toggle visual back button in standard header
  const backBtn = document.getElementById('back-btn');
  if (viewName === 'home') {
    backBtn.classList.add('invisible', 'pointer-events-none');
    document.getElementById('home-screen').classList.remove('hidden');
    renderHomeScreen();
  } else if (viewName === 'add') {
    backBtn.classList.remove('invisible', 'pointer-events-none');
    document.getElementById('add-dog-screen').classList.remove('hidden');
    setupAddScreenForm();
  } else if (viewName === 'details') {
    backBtn.classList.remove('invisible', 'pointer-events-none');
    document.getElementById('dog-details-screen').classList.remove('hidden');
    renderDetailsScreen(dogId);
  }

  // Scroll to top of window
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ==========================================
// 4. RENDERERS & EVENT HANDLERS
// ==========================================

// Home Screen Renderer
async function renderHomeScreen() {
  try {
    state.dogs = await dbOps.getAllDogs();
    
    // Process search & sorting filters
    let filteredDogs = state.dogs.filter((dog) => {
      const matchQuery = state.searchQuery.toLowerCase();
      return (
        dog.name.toLowerCase().includes(matchQuery) ||
        dog.owner.toLowerCase().includes(matchQuery) ||
        (dog.room && dog.room.toLowerCase().includes(matchQuery)) ||
        (dog.items && dog.items.toLowerCase().includes(matchQuery))
      );
    });

    // Apply Sorting logic
    if (state.sortBy === 'date-desc') {
      filteredDogs.sort((a, b) => b.checkedInAt - a.checkedInAt);
    } else if (state.sortBy === 'date-asc') {
      filteredDogs.sort((a, b) => a.checkedInAt - b.checkedInAt);
    } else if (state.sortBy === 'name-asc') {
      filteredDogs.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Render Stats
    document.getElementById('stat-total-dogs').textContent = state.dogs.length;
    
    const todayStart = new Date().setHours(0,0,0,0);
    const checkedInTodayCount = state.dogs.filter(d => Number(d.checkedInAt) >= todayStart).length;
    document.getElementById('stat-today-dogs').textContent = checkedInTodayCount;

    const dogListContainer = document.getElementById('dogs-list');
    dogListContainer.innerHTML = '';

    if (filteredDogs.length === 0) {
      // Empty state template
      dogListContainer.innerHTML = `
        <div id="empty-state" class="flex flex-col items-center justify-center text-center p-8 py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div class="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center text-pink-600 mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
          <h3 class="font-display font-semibold text-lg text-slate-800 mb-1">${t('no_dogs_title')}</h3>
          <p class="text-sm text-slate-500 max-w-xs mb-6">${t('no_dogs_desc')}</p>
          <button id="empty-state-add-btn" class="bg-pink-500 hover:bg-pink-600 active-tap text-white font-medium px-6 py-3 rounded-2xl shadow-md transition-all text-sm flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path>
            </svg>
            ${t('check_in_btn')}
          </button>
        </div>
      `;

      document.getElementById('empty-state-add-btn')?.addEventListener('click', () => navigateTo('add'));
      return;
    }

    // Render list of dogs
    for (const dog of filteredDogs) {
      // Fetch the dog's photos to show their latest snapshot on the card
      const photos = await dbOps.getPhotosByDog(dog.id);
      const thumbnailSrc = photos.length > 0 ? photos[0].base64 : null;

      const card = document.createElement('div');
      card.id = `dog-card-${dog.id}`;
      card.className = 'bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-pink-300 active-tap transition-all cursor-pointer flex gap-4 items-center relative';
      
      const avatarHTML = thumbnailSrc 
        ? `<img src="${thumbnailSrc}" alt="${dog.name}" class="w-16 h-16 rounded-2xl object-cover border border-slate-100 flex-shrink-0" referrerPolicy="no-referrer">`
        : `<div class="w-16 h-16 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center flex-shrink-0 border border-pink-100 font-display font-black text-2xl paw-bg">
            ${dog.name.charAt(0).toUpperCase()}
           </div>`;

      const itemsCount = dog.items ? dog.items.split(',').filter(i => i.trim().length > 0).length : 0;
      let belongingText = '';
      if (state.language === 'de') {
        belongingText = `${itemsCount} Gegenstand/Gegenstände`;
      } else if (state.language === 'th') {
        belongingText = `สัมภาระ ${itemsCount} ชิ้น`;
      } else {
        belongingText = `${itemsCount} Belonging${itemsCount > 1 ? 's' : ''}`;
      }

      const itemsBadgeHTML = itemsCount > 0 
        ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-100/50">
             <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
             ${belongingText}
           </span>`
        : '';

      const noRoomText = state.language === 'de' ? 'Kein Zimmer' : (state.language === 'th' ? 'ไม่มีห้องพัก' : 'No Room');
      const roomBadgeHTML = dog.room 
        ? `<span class="text-[10px] bg-pink-100 text-pink-700 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide flex-shrink-0">${dog.room}</span>` 
        : `<span class="text-[10px] bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide flex-shrink-0">${noRoomText}</span>`;

      // Render custom caret and care status based on care category selected
      let careTagHTML = '';
      if (dog.careTag === 'special-diet') {
        careTagHTML = `
          <div class="flex gap-1 items-center">
            <span class="w-2 h-2 rounded-full bg-orange-400"></span>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">${t('care_diet')}</span>
          </div>
        `;
      } else if (dog.careTag === 'meds') {
        careTagHTML = `
          <div class="flex gap-1 items-center">
            <span class="w-2 h-2 rounded-full bg-red-400"></span>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">${t('care_meds')}</span>
          </div>
        `;
      } else if (dog.careTag === 'active') {
        careTagHTML = `
          <div class="flex gap-1 items-center">
            <span class="w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">${t('care_active')}</span>
          </div>
        `;
      } else {
        careTagHTML = `
          <div class="flex gap-1 items-center">
            <span class="w-2 h-2 rounded-full bg-blue-400"></span>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">${t('care_standard')}</span>
          </div>
        `;
      }

      card.innerHTML = `
        ${avatarHTML}
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-0.5">
            <h4 class="font-display font-bold text-slate-800 text-base truncate">${dog.name}</h4>
            ${roomBadgeHTML}
          </div>
          <p class="text-xs text-slate-500 mb-1 truncate">${t('label_owner_name')}: <strong class="text-slate-700 font-medium">${dog.owner}</strong></p>
          <p class="text-[10px] text-slate-400 font-mono mb-2">${getTimeElapsed(dog.checkedInAt)}</p>
          <div class="flex flex-wrap gap-2 items-center">
            ${careTagHTML}
            ${itemsBadgeHTML}
          </div>
        </div>
        <div class="text-slate-300 flex-shrink-0">
          <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </div>
      `;

      card.addEventListener('click', () => navigateTo('details', dog.id));
      dogListContainer.appendChild(card);
    }
  } catch (error) {
    console.error('Error rendering Home Screen:', error);
    showToast(t('toast_error_load'), 'error');
  }
}

// Add Dog Screen Setup
function setupAddScreenForm() {
  const form = document.getElementById('dog-form');
  form.reset();
  
  // Set title
  document.getElementById('form-view-title').textContent = t('form_new_title');
  document.getElementById('submit-btn-text').textContent = t('btn_complete_checkin');
  
  // Clear any existing ID to make it a fresh save
  form.dataset.editMode = 'false';
  form.dataset.dogId = '';
}

// Dog Details Screen Renderer
async function renderDetailsScreen(id) {
  try {
    const dog = await dbOps.getDog(id);
    if (!dog) {
      showToast(t('toast_error_load'), 'error');
      navigateTo('home');
      return;
    }

    // Populate metadata
    document.getElementById('detail-dog-name').textContent = dog.name;
    document.getElementById('detail-owner-name').textContent = dog.owner;
    document.getElementById('detail-checkin-time').textContent = formatDate(dog.checkedInAt);
    document.getElementById('detail-stay-duration').textContent = getTimeElapsed(dog.checkedInAt);

    // Populate Room and Care tags on details screen
    const detailRoomEl = document.getElementById('detail-room-badge');
    if (detailRoomEl) {
      const notAssignedText = state.language === 'de' ? 'Nicht zugewiesen' : (state.language === 'th' ? 'ไม่ได้ระบุห้อง' : 'Not Assigned');
      detailRoomEl.textContent = dog.room ? dog.room : notAssignedText;
    }

    const careBadgeEl = document.getElementById('detail-care-badge');
    if (careBadgeEl) {
      if (dog.careTag === 'special-diet') {
        careBadgeEl.className = "inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-orange-100";
        careBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>${t('care_diet')}`;
      } else if (dog.careTag === 'meds') {
        careBadgeEl.className = "inline-flex items-center gap-1.5 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-red-100";
        careBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>${t('care_meds')}`;
      } else if (dog.careTag === 'active') {
        careBadgeEl.className = "inline-flex items-center gap-1.5 bg-pink-50 text-pink-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-pink-100";
        careBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-pink-500 pulse-badge"></span>${t('care_active')}`;
      } else {
        careBadgeEl.className = "inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-blue-100";
        careBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>${t('care_standard')}`;
      }
    }

    // Items list formatting
    const itemsContainer = document.getElementById('detail-items-container');
    itemsContainer.innerHTML = '';
    
    if (dog.items && dog.items.trim().length > 0) {
      // Split items by commas, newlines, or semicolons
      const itemsList = dog.items.split(/[\n,;]+/).map(item => item.trim()).filter(item => item.length > 0);
      
      const ul = document.createElement('ul');
      ul.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600';
      
      itemsList.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50';
        li.innerHTML = `
          <svg class="w-4 h-4 text-pink-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="truncate text-slate-700 font-medium">${item}</span>
        `;
        ul.appendChild(li);
      });
      itemsContainer.appendChild(ul);
    } else {
      itemsContainer.innerHTML = `
        <div class="bg-slate-50 border border-dashed border-slate-200 text-slate-400 p-4 rounded-xl text-center text-xs">
          ${t('detail_no_luggage')}
        </div>
      `;
    }

    // Load photo diary
    renderPhotoGallery(id);

  } catch (error) {
    console.error('Error fetching details:', error);
    showToast(t('toast_error_load'), 'error');
  }
}

// Render Photos Grid for specific dog
async function renderPhotoGallery(dogId) {
  try {
    const photos = await dbOps.getPhotosByDog(dogId);
    const galleryContainer = document.getElementById('photos-grid');
    
    // Reset gallery container except the "Add Photo" card
    const addPhotoCard = document.getElementById('camera-trigger-card');
    galleryContainer.innerHTML = '';
    galleryContainer.appendChild(addPhotoCard);

    // Update photo counter badge
    document.getElementById('photo-diary-count').textContent = photos.length;

    photos.forEach((photo) => {
      const wrapper = document.createElement('div');
      wrapper.id = `photo-card-${photo.id}`;
      wrapper.className = 'relative aspect-square rounded-2xl overflow-hidden shadow-sm border border-slate-150 active-tap cursor-pointer group';
      
      const isVideo = photo.type === 'video' || (photo.base64 && photo.base64.startsWith('data:video/'));
      if (isVideo) {
        wrapper.innerHTML = `
          <video src="${photo.base64}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" muted playsinline></video>
          <div class="absolute inset-0 flex items-center justify-center bg-black/15">
            <div class="w-10 h-10 rounded-full bg-white/95 shadow-md flex items-center justify-center text-pink-600">
              <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"></path>
              </svg>
            </div>
          </div>
          <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-2 text-[10px] text-white/90 font-mono flex justify-between items-center">
            <span>${formatDate(photo.timestamp).split(',')[0]}</span>
            <span class="bg-black/40 px-1 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold">Video</span>
          </div>
        `;
      } else {
        wrapper.innerHTML = `
          <img src="${photo.base64}" alt="Dog Photo" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer">
          <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-2 text-[10px] text-white/90 font-mono">
            ${formatDate(photo.timestamp).split(',')[0]}
          </div>
        `;
      }

      wrapper.addEventListener('click', () => openLightbox(photo));
      galleryContainer.insertBefore(wrapper, addPhotoCard);
    });

  } catch (error) {
    console.error('Error loading photo gallery:', error);
    showToast(t('toast_error_photo'), 'error');
  }
}

// Lightbox controller
function openLightbox(photo) {
  const lightbox = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const video = document.getElementById('lightbox-video');
  const caption = document.getElementById('lightbox-caption');
  const deleteBtn = document.getElementById('lightbox-delete-btn');
  const exportBtn = document.getElementById('lightbox-export-btn');
  const shareBtn = document.getElementById('lightbox-share-btn');

  const isVideo = photo.type === 'video' || (photo.base64 && photo.base64.startsWith('data:video/'));

  if (isVideo) {
    img.classList.add('hidden');
    video.classList.remove('hidden');
    video.src = photo.base64;
    video.load();
    video.play().catch(e => console.log('Video autoplay blocked:', e));
  } else {
    video.classList.add('hidden');
    video.pause();
    video.src = '';
    img.classList.remove('hidden');
    img.src = photo.base64;
  }
  
  const capturedOnText = state.language === 'de' ? 'Aufgenommen am' : (state.language === 'th' ? 'ถ่ายเมื่อ' : 'Captured on');
  caption.textContent = `${capturedOnText} ${formatDate(photo.timestamp)}`;
  
  // Clean listeners and assign delete handler
  deleteBtn.onclick = async () => {
    if (confirm(t('alert_delete_photo_confirm'))) {
      try {
        await dbOps.deletePhoto(photo.id);
        lightbox.classList.add('hidden');
        video.pause();
        video.src = '';
        renderPhotoGallery(photo.dogId);
        showToast(t('toast_photo_deleted'));
      } catch (err) {
        showToast(t('toast_error_delete_photo'), 'error');
      }
    }
  };

  // Export to Device / Phone Gallery
  exportBtn.onclick = () => {
    try {
      const ext = isVideo ? 'mp4' : 'jpg';
      const a = document.createElement('a');
      a.href = photo.base64;
      a.download = `cute-toda-media-${photo.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      showToast(t('toast_export_success'));
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed', 'error');
    }
  };

  // Direct share to Facebook Messenger
  shareBtn.onclick = async () => {
    try {
      const ext = isVideo ? 'mp4' : 'jpg';
      const mime = isVideo ? 'video/mp4' : 'image/jpeg';
      
      // Native Share Sheet (Messenger, WhatsApp, airDrop, Bluetooth, Save...)
      if (navigator.share && navigator.canShare) {
        const response = await fetch(photo.base64);
        const blob = await response.blob();
        const file = new File([blob], `cute-toda-media-${photo.id}.${ext}`, { type: mime });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Cute Toda Guest Update',
            text: `Check out our canine guest's update from Cute Toda Hotel!`
          });
          return;
        }
      }
      
      // Deep Link to Messenger
      const encodedText = encodeURIComponent(`Check out this pet update from the Cute Toda boarding hotel!`);
      const messengerUrl = `fb-messenger://share/?text=${encodedText}`;
      const webFallback = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(window.location.href)}&app_id=123456789&redirect_uri=${encodeURIComponent(window.location.href)}`;
      
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = messengerUrl;
      document.body.appendChild(iframe);
      
      setTimeout(() => {
        document.body.removeChild(iframe);
        window.open(webFallback, '_blank');
      }, 500);

      showToast(t('toast_share_opening'));
    } catch (err) {
      console.error('Sharing failed:', err);
      window.open('https://m.me', '_blank');
      showToast(t('toast_share_info'), 'info');
    }
  };

  lightbox.classList.remove('hidden');
}

// Edit Dog Profile Handler
async function startEditDogProfile() {
  const dogId = state.activeDogId;
  try {
    const dog = await dbOps.getDog(dogId);
    if (!dog) return;

    // Navigate to Add View but configure it as Edit View
    navigateTo('add');
    
    // Setup Edit Headers
    document.getElementById('form-view-title').textContent = t('form_edit_title', { name: dog.name });
    document.getElementById('submit-btn-text').textContent = t('btn_save_changes');
    
    // Set field values
    document.getElementById('dog-name').value = dog.name;
    document.getElementById('owner-name').value = dog.owner;
    document.getElementById('dog-room').value = dog.room || '';
    document.getElementById('dog-tag').value = dog.careTag || 'standard';
    document.getElementById('dog-items').value = dog.items || '';
    
    // Flag edit state on the form element
    const form = document.getElementById('dog-form');
    form.dataset.editMode = 'true';
    form.dataset.dogId = dog.id;

  } catch (err) {
    showToast(t('toast_error_load'), 'error');
  }
}

// Delete Dog Handler
async function deleteDogProfile() {
  const dogId = state.activeDogId;
  const dog = await dbOps.getDog(dogId);
  if (!dog) return;

  if (confirm(t('alert_checkout_confirm', { name: dog.name }))) {
    try {
      await dbOps.deleteDog(dogId);
      showToast(t('toast_checkout_success', { name: dog.name }));
      navigateTo('home');
    } catch (err) {
      showToast(t('toast_error_checkout'), 'error');
    }
  }
}

// ==========================================
// 5. EVENT BINDING & BOOTSTRAP
// ==========================================

function initAppEvents() {
  // Navigation Event listeners
  document.getElementById('back-btn').addEventListener('click', () => {
    if (state.currentView === 'add' && document.getElementById('dog-form').dataset.editMode === 'true') {
      navigateTo('details', state.activeDogId);
    } else {
      navigateTo('home');
    }
  });

  document.getElementById('fab-add-dog').addEventListener('click', () => navigateTo('add'));
  document.getElementById('cancel-form-btn').addEventListener('click', () => {
    if (document.getElementById('dog-form').dataset.editMode === 'true') {
      navigateTo('details', state.activeDogId);
    } else {
      navigateTo('home');
    }
  });

  // Search & Filter Events
  const searchInput = document.getElementById('search-dogs');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderHomeScreen();
  });

  // Clear search query click
  document.getElementById('clear-search-btn')?.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    renderHomeScreen();
  });

  // Sorting Handler
  document.getElementById('sort-dogs').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderHomeScreen();
  });

  // Dog check-in form submission
  document.getElementById('dog-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = e.target;
    const isEditMode = form.dataset.editMode === 'true';
    const editDogId = form.dataset.dogId;
    
    const name = document.getElementById('dog-name').value.trim();
    const owner = document.getElementById('owner-name').value.trim();
    const room = document.getElementById('dog-room').value.trim();
    const careTag = document.getElementById('dog-tag').value;
    const items = document.getElementById('dog-items').value.trim();

    if (!name || !owner) {
      const errorMsg = state.language === 'de' ? 'Hundename und Besitzername sind erforderlich' : (state.language === 'th' ? 'จำเป็นต้องระบุชื่อสุนัขและชื่อเจ้าของ' : 'Dog name and Owner name are required');
      showToast(errorMsg, 'error');
      return;
    }

    try {
      let savedDog;
      if (isEditMode) {
        // Fetch current profile to retain original check-in timestamp
        const origDog = await dbOps.getDog(editDogId);
        savedDog = {
          id: editDogId,
          name,
          owner,
          room,
          careTag,
          items,
          checkedInAt: origDog.checkedInAt
        };
        await dbOps.saveDog(savedDog);
        showToast(t('toast_profile_updated'));
        navigateTo('details', editDogId);
      } else {
        // Create fresh guest record
        savedDog = {
          id: Date.now().toString(),
          name,
          owner,
          room,
          careTag,
          items,
          checkedInAt: Date.now()
        };
        await dbOps.saveDog(savedDog);
        showToast(t('toast_checkin_success', { name }));
        navigateTo('home');
      }
    } catch (err) {
      console.error(err);
      showToast(t('toast_error_saving'), 'error');
    }
  });

  // Action listeners inside Dog Details screen
  document.getElementById('edit-dog-btn').addEventListener('click', startEditDogProfile);
  document.getElementById('checkout-dog-btn').addEventListener('click', deleteDogProfile);

  // Hidden camera files input handling
  const cameraInput = document.getElementById('camera-input');
  const videoInput = document.getElementById('video-input');
  
  // Bottom action sheet controllers
  const mediaSheet = document.getElementById('media-action-sheet');
  const mediaSheetContent = document.getElementById('media-action-sheet-content');

  const openMediaSheet = () => {
    mediaSheet.classList.remove('hidden');
    // Tick to trigger smooth transition
    setTimeout(() => {
      mediaSheet.classList.remove('opacity-0');
      mediaSheetContent.classList.remove('translate-y-full');
    }, 10);
  };

  const closeMediaSheet = () => {
    mediaSheet.classList.add('opacity-0');
    mediaSheetContent.classList.add('translate-y-full');
    setTimeout(() => {
      mediaSheet.classList.add('hidden');
    }, 300);
  };

  document.getElementById('camera-trigger-card').addEventListener('click', () => {
    openMediaSheet();
  });

  document.getElementById('close-media-sheet-btn').addEventListener('click', closeMediaSheet);
  
  mediaSheet.addEventListener('click', (e) => {
    if (e.target === mediaSheet) closeMediaSheet();
  });

  document.getElementById('option-add-photo').addEventListener('click', () => {
    closeMediaSheet();
    cameraInput.click();
  });

  document.getElementById('option-add-video').addEventListener('click', () => {
    closeMediaSheet();
    videoInput.click();
  });

  // Helper to convert media files to Base64
  const fileToDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast(t('toast_processing_photo'), 'info');

    try {
      // Compress and resize native camera outputs for optimal local indexing
      const base64Photo = await compressImage(file);
      
      const newPhoto = {
        id: Date.now().toString(),
        dogId: state.activeDogId,
        base64: base64Photo,
        type: 'image',
        timestamp: Date.now()
      };

      await dbOps.savePhoto(newPhoto);
      showToast(t('toast_photo_saved'));
      renderPhotoGallery(state.activeDogId);

      // Reset camera input
      cameraInput.value = '';
    } catch (err) {
      console.error(err);
      showToast(t('toast_error_photo'), 'error');
    }
  });

  videoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast(t('toast_video_processing'), 'info');

    try {
      const base64Video = await fileToDataURL(file);
      
      const newVideo = {
        id: Date.now().toString(),
        dogId: state.activeDogId,
        base64: base64Video,
        type: 'video',
        timestamp: Date.now()
      };

      await dbOps.savePhoto(newVideo);
      
      showToast(t('toast_video_saved'));
      renderPhotoGallery(state.activeDogId);

      // Reset video input
      videoInput.value = '';
    } catch (err) {
      console.error(err);
      showToast(t('toast_video_error'), 'error');
    }
  });

  const stopVideo = () => {
    const video = document.getElementById('lightbox-video');
    if (video) {
      video.pause();
      video.src = '';
    }
  };

  // Lightbox Close Controllers
  document.getElementById('lightbox-close-btn').addEventListener('click', () => {
    stopVideo();
    document.getElementById('lightbox-modal').classList.add('hidden');
  });

  document.getElementById('lightbox-modal').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-modal') {
      stopVideo();
      document.getElementById('lightbox-modal').classList.add('hidden');
    }
  });

  // Language selector listener
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.value = state.language;
    langSelect.addEventListener('change', (e) => {
      state.language = e.target.value;
      localStorage.setItem('pawpal_language', state.language);
      updateLanguageDOM();
      
      // Re-navigate or re-render to update currently active view contents
      if (state.currentView === 'home') {
        renderHomeScreen();
      } else if (state.currentView === 'details') {
        renderDetailsScreen(state.activeDogId);
      } else if (state.currentView === 'add') {
        const form = document.getElementById('dog-form');
        const isEditMode = form.dataset.editMode === 'true';
        if (isEditMode) {
          const editDogId = form.dataset.dogId;
          dbOps.getDog(editDogId).then(dog => {
            if (dog) {
              document.getElementById('form-view-title').textContent = t('form_edit_title', { name: dog.name });
              document.getElementById('submit-btn-text').textContent = t('btn_save_changes');
            }
          });
        } else {
          setupAddScreenForm();
        }
      }
    });
  }
}

// Register service worker for offline loading capabilities
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('PWA Service Worker registered successfully! Scope:', reg.scope);
        })
        .catch((err) => {
          console.error('PWA Service Worker registration failed:', err);
        });
    });
  }
}

// Bootstrap application on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    initAppEvents();
    updateLanguageDOM();
    registerServiceWorker();
    navigateTo('home');
  } catch (error) {
    console.error('Bootstrapping error:', error);
    showToast('Critical startup error. Refresh and try again.', 'error');
  }
});
