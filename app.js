/* ═══════════════════════════════════════════════════════════════
   MasLa Recipe Finder — App Logic
   Recipe detection via server-side proxy
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── CONSTANTS ──────────────────────────────────────────────────
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const HISTORY_KEY    = 'masla_history';
const LANGUAGE_KEY   = 'masla_language';
const DETAIL_KEY     = 'masla_detail';
const API_KEY_STORAGE = 'masla_gemini_key';
const MAX_HISTORY    = 5;

// ── STATE ──────────────────────────────────────────────────────
let state = {
  currentPage: 'home',
  capturedImageBase64: null,
  capturedImageMimeType: null,
  cameraStream: null,
  isCameraActive: false,
  currentResult: null,
  language: 'English',
  detailLevel: 'simple',
  apiKey: '',
};

// ── DOM REFS ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  splash:           $('splash-screen'),
  app:              $('app'),
  // Capture
  captureCard:      $('capture-card'),
  capturePreview:   $('capture-preview'),
  capturePlaceholder: $('capture-placeholder'),
  cameraVideo:      $('camera-video'),
  cameraCanvas:     $('camera-canvas'),
  previewImage:     $('preview-image'),
  cameraOverlay:    $('camera-overlay'),
  previewOverlay:   $('preview-overlay'),
  clearImageBtn:    $('clear-image-btn'),
  cameraBtn:        $('camera-btn'),
  shutterBtn:       $('shutter-btn'),
  galleryBtn:       $('gallery-btn'),
  cameraInput:      $('camera-input'),
  galleryInput:     $('gallery-input'),
  // Detect
  detectBtn:        $('detect-btn'),
  loadingCard:      $('loading-card'),
  loadingMessage:   $('loading-message'),
  // Result
  resultCard:       $('result-card'),
  resultBadge:      $('result-badge'),
  resultCuisine:    $('result-cuisine'),
  resultTitle:      $('result-title'),
  resultDescription: $('result-description'),
  resultTips:       $('result-tips'),
  statTime:         $('stat-time'),
  statCalories:     $('stat-calories'),
  statDifficulty:   $('stat-difficulty'),
  ingredientsList:  $('ingredients-list'),
  stepsList:        $('steps-list'),
  resultSaveBtn:    $('result-save-btn'),
  shareBtn:         $('share-btn'),
  tryAnotherBtn:    $('try-another-btn'),
  tipsBox:          $('tips-box'),
  // History
  historyList:      $('history-list'),
  historyEmpty:     $('history-empty'),
  clearHistoryBtn:  $('clear-history-btn'),
  // Settings
  languageSelect:   $('language-select'),
  settingsBtn:      $('settings-btn'),
  apiKeyInput:      $('api-key-input'),
  apiKeySaveBtn:    $('api-key-save-btn'),
  // Nav
  navHome:          $('nav-home'),
  navHistory:       $('nav-history'),
  navSettings:      $('nav-settings'),
  // Toast
  toastContainer:   $('toast-container'),
};

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
function init() {
  loadSettings();
  setupEventListeners();
  renderHistory();

  // Initialise Lucide icons
  if (window.lucide) lucide.createIcons();

  // Splash → App transition
  setTimeout(() => {
    dom.splash.classList.add('fade-out');
    setTimeout(() => {
      dom.splash.classList.add('hidden');
      dom.app.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }, 500);
  }, 1800);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
function loadSettings() {
  const savedLang = localStorage.getItem(LANGUAGE_KEY);
  if (savedLang) {
    state.language = savedLang;
    dom.languageSelect.value = savedLang;
  }

  const savedDetail = localStorage.getItem(DETAIL_KEY);
  if (savedDetail) {
    state.detailLevel = savedDetail;
    document.querySelectorAll('.detail-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.detail === savedDetail);
    });
  }

  const savedKey = localStorage.getItem(API_KEY_STORAGE);
  if (savedKey) {
    state.apiKey = savedKey;
    dom.apiKeyInput.value = savedKey;
  }
}

// ══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════════════════════════
function setupEventListeners() {
  // Navigation
  dom.navHome.addEventListener('click', () => navigateTo('home'));
  dom.navHistory.addEventListener('click', () => navigateTo('history'));
  dom.navSettings.addEventListener('click', () => navigateTo('settings'));
  dom.settingsBtn.addEventListener('click', () => navigateTo('settings'));

  // Camera
  dom.cameraBtn.addEventListener('click', handleCameraBtn);
  dom.shutterBtn.addEventListener('click', captureFromCamera);
  dom.galleryBtn.addEventListener('click', () => dom.galleryInput.click());
  dom.galleryInput.addEventListener('change', handleFileInput);
  dom.cameraInput.addEventListener('change', handleFileInput);
  dom.clearImageBtn.addEventListener('click', clearImage);

  // Detect
  dom.detectBtn.addEventListener('click', detectRecipe);

  // Tabs
  document.querySelectorAll('.result-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Result Actions
  dom.resultSaveBtn.addEventListener('click', toggleSaveRecipe);
  dom.shareBtn.addEventListener('click', shareRecipe);
  dom.tryAnotherBtn.addEventListener('click', resetToCapture);

  // History
  dom.clearHistoryBtn.addEventListener('click', clearHistory);

  // Settings
  dom.languageSelect.addEventListener('change', () => {
    state.language = dom.languageSelect.value;
    localStorage.setItem(LANGUAGE_KEY, state.language);
  });

  dom.apiKeySaveBtn.addEventListener('click', () => {
    const key = dom.apiKeyInput.value.trim();
    if (!key) {
      showToast('Please enter a valid API key', 'error');
      return;
    }
    state.apiKey = key;
    localStorage.setItem(API_KEY_STORAGE, key);
    showToast('✅ API key saved!', 'success');
  });

  document.querySelectorAll('.detail-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.detail-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.detailLevel = btn.dataset.detail;
      localStorage.setItem(DETAIL_KEY, state.detailLevel);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
function navigateTo(page) {
  if (state.currentPage === page) return;
  state.currentPage = page;

  // Toggle pages
  document.querySelectorAll('.page').forEach(p => {
    const isTarget = p.id === `page-${page}`;
    p.classList.toggle('active', isTarget);
    p.classList.toggle('hidden', !isTarget);
  });

  // Toggle nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  if (page === 'history') renderHistory();

  if (window.lucide) lucide.createIcons();

  // Scroll to top
  document.querySelector('.app-main').scrollTop = 0;
}

// ══════════════════════════════════════════════════════════════
// CAMERA
// ══════════════════════════════════════════════════════════════
async function handleCameraBtn() {
  if (state.isCameraActive) {
    // Stop camera
    stopCamera();
    return;
  }

  // Try to use the device camera via getUserMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      startCameraStream(stream);
    } catch (err) {
      // Fall back to file input with camera capture
      dom.cameraInput.click();
    }
  } else {
    dom.cameraInput.click();
  }
}

function startCameraStream(stream) {
  state.cameraStream = stream;
  state.isCameraActive = true;

  dom.cameraVideo.srcObject = stream;
  dom.cameraVideo.classList.remove('hidden');
  dom.cameraOverlay.classList.remove('hidden');
  dom.capturePlaceholder.classList.add('hidden');
  dom.previewImage.classList.add('hidden');
  dom.previewOverlay.classList.add('hidden');

  // Show shutter, update camera btn
  dom.shutterBtn.classList.remove('hidden');
  dom.cameraBtn.querySelector('span').textContent = 'Stop';
  dom.galleryBtn.style.opacity = '0.4';
  dom.galleryBtn.style.pointerEvents = 'none';

  dom.detectBtn.disabled = true;
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  state.isCameraActive = false;

  dom.cameraVideo.classList.add('hidden');
  dom.cameraOverlay.classList.add('hidden');
  dom.shutterBtn.classList.add('hidden');
  dom.cameraBtn.querySelector('span').textContent = 'Camera';
  dom.galleryBtn.style.opacity = '';
  dom.galleryBtn.style.pointerEvents = '';

  if (!state.capturedImageBase64) {
    dom.capturePlaceholder.classList.remove('hidden');
    dom.detectBtn.disabled = true;
  }
}

function captureFromCamera() {
  const video = dom.cameraVideo;
  const canvas = dom.cameraCanvas;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      setPreviewImage(dataUrl, base64, 'image/jpeg');
    };
    reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.85);

  stopCamera();
}

// ══════════════════════════════════════════════════════════════
// FILE / GALLERY
// ══════════════════════════════════════════════════════════════
function handleFileInput(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = event => {
    const dataUrl = event.target.result;
    const base64  = dataUrl.split(',')[1];
    setPreviewImage(dataUrl, base64, file.type);
  };
  reader.readAsDataURL(file);

  // Reset input so the same file can be selected again
  e.target.value = '';
}

function setPreviewImage(dataUrl, base64, mimeType) {
  state.capturedImageBase64 = base64;
  state.capturedImageMimeType = mimeType;

  dom.previewImage.src = dataUrl;
  dom.previewImage.classList.remove('hidden');
  dom.capturePlaceholder.classList.add('hidden');
  dom.previewOverlay.classList.remove('hidden');
  dom.cameraVideo.classList.add('hidden');
  dom.cameraOverlay.classList.add('hidden');

  dom.detectBtn.disabled = false;

  // Hide result card if visible
  dom.resultCard.classList.add('hidden');
  dom.loadingCard.classList.add('hidden');

  if (window.lucide) lucide.createIcons();
}

function clearImage() {
  state.capturedImageBase64 = null;
  state.capturedImageMimeType = null;

  dom.previewImage.src = '';
  dom.previewImage.classList.add('hidden');
  dom.previewOverlay.classList.add('hidden');
  dom.capturePlaceholder.classList.remove('hidden');
  dom.resultCard.classList.add('hidden');
  dom.detectBtn.disabled = true;
}

// ══════════════════════════════════════════════════════════════
// GEMINI API — RECIPE DETECTION
// ══════════════════════════════════════════════════════════════
const DETAIL_INSTRUCTIONS = {
  simple: 'Provide a concise recipe with essential ingredients and 4-6 main cooking steps.',
  standard: 'Provide a well-detailed recipe with exact ingredient measurements and 6-8 clear cooking steps.',
  detailed: 'Provide a very detailed professional recipe with precise measurements, preparation tips, plating suggestions, and 8-12 thorough cooking steps.',
};

function buildPrompt(language, detailLevel) {
  const detailInstructions = DETAIL_INSTRUCTIONS[detailLevel] || DETAIL_INSTRUCTIONS.standard;
  return `You are a world-class culinary AI. Analyze the food in this image and respond ONLY with a valid JSON object — no markdown, no code fences, no extra text.

Language for the response: ${language}
Detail level: ${detailInstructions}

JSON schema (all fields required):
{
  "foodName": "Name of the dish",
  "cuisine": "Cuisine type (e.g. Italian, Filipino, Thai)",
  "description": "2-3 sentence appetizing description of the dish",
  "prepTime": "e.g. 30 minutes",
  "calories": "e.g. 450 kcal per serving",
  "difficulty": "Easy | Medium | Hard",
  "servings": "e.g. 4 servings",
  "tips": "1-2 chef tips for best results",
  "ingredients": [
    { "name": "Ingredient name", "amount": "quantity + unit" }
  ],
  "steps": [
    "Step description"
  ]
}

If you cannot identify food in the image, respond with:
{ "error": "No food detected in the image. Please try a clearer photo of a dish." }`;
}

async function detectRecipe() {
  if (!state.capturedImageBase64) {
    showToast('Please capture or upload a food photo first', 'error');
    return;
  }

  if (!state.apiKey) {
    showToast('Please add your Gemini API key in Settings first', 'error', 4000);
    navigateTo('settings');
    return;
  }

  // Show loading
  dom.loadingCard.classList.remove('hidden');
  dom.resultCard.classList.add('hidden');
  dom.detectBtn.disabled = true;
  dom.detectBtn.querySelector('span').textContent = 'Detecting…';

  const messages = [
    'Identifying ingredients',
    'Analyzing food composition',
    'Generating recipe',
    'Adding cooking tips',
    'Almost ready!'
  ];
  let msgIndex = 0;
  const msgInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % messages.length;
    dom.loadingMessage.textContent = messages[msgIndex];
  }, 1200);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${state.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: buildPrompt(state.language, state.detailLevel) },
            { inline_data: { mime_type: state.capturedImageMimeType, data: state.capturedImageBase64 } },
          ],
        }],
        generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 2048 },
      }),
    });

    clearInterval(msgInterval);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = data?.error?.message || `API error: ${response.status}`;
      if (response.status === 400 && errMsg.toLowerCase().includes('api key')) {
        showToast('Invalid API key. Please check your key in Settings.', 'error', 5000);
        navigateTo('settings');
      } else if (response.status === 429) {
        showToast('Too many requests. Please wait a moment and try again.', 'error', 4000);
      } else {
        showToast(errMsg, 'error', 4000);
      }
      dom.loadingCard.classList.add('hidden');
      dom.detectBtn.disabled = false;
      dom.detectBtn.querySelector('span').textContent = 'Detect Recipe';
      return;
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Empty response from AI. Please try again.');
    }

    const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
    const recipe = JSON.parse(cleaned);

    if (recipe.error) {
      showToast(recipe.error, 'error', 4000);
      dom.loadingCard.classList.add('hidden');
      dom.detectBtn.disabled = false;
      dom.detectBtn.querySelector('span').textContent = 'Detect Recipe';
      return;
    }

    displayRecipe(recipe);
    saveToHistory(recipe);

  } catch (err) {
    clearInterval(msgInterval);
    console.error('Detection error:', err);

    let userMsg = err.message || 'Something went wrong. Please try again.';
    if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
      userMsg = 'Network error. Please check your connection.';
    }

    showToast(userMsg, 'error', 4000);
    dom.loadingCard.classList.add('hidden');
    dom.detectBtn.disabled = false;
    dom.detectBtn.querySelector('span').textContent = 'Detect Recipe';
  }
}

// ══════════════════════════════════════════════════════════════
// DISPLAY RECIPE
// ══════════════════════════════════════════════════════════════
function displayRecipe(recipe) {
  state.currentResult = recipe;

  dom.loadingCard.classList.add('hidden');
  dom.detectBtn.disabled = false;
  dom.detectBtn.querySelector('span').textContent = 'Detect Recipe';

  // Populate
  dom.resultCuisine.textContent = recipe.cuisine || 'Unknown';
  dom.resultTitle.textContent = recipe.foodName || 'Unknown Dish';
  dom.resultDescription.textContent = recipe.description || '';
  dom.statTime.textContent = recipe.prepTime || '—';
  dom.statCalories.textContent = recipe.calories || '—';
  dom.statDifficulty.textContent = recipe.difficulty || '—';

  // Tips
  if (recipe.tips) {
    dom.resultTips.textContent = recipe.tips;
    dom.tipsBox.classList.remove('hidden');
  } else {
    dom.tipsBox.classList.add('hidden');
  }

  // Ingredients
  dom.ingredientsList.innerHTML = '';
  (recipe.ingredients || []).forEach(ing => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${ing.name}</span><span class="ingredient-amount">${ing.amount || ''}</span>`;
    dom.ingredientsList.appendChild(li);
  });

  // Steps
  dom.stepsList.innerHTML = '';
  (recipe.steps || []).forEach((step, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="step-number">${i + 1}</div><p class="step-text">${step}</p>`;
    dom.stepsList.appendChild(li);
  });

  // Reset tabs to Overview
  switchTab('overview');

  dom.resultCard.classList.remove('hidden');

  // Scroll to result
  setTimeout(() => {
    dom.resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  if (window.lucide) lucide.createIcons();

  showToast(`🍽️ ${recipe.foodName} recipe ready!`, 'success', 2500);
}

// ══════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.result-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
    t.setAttribute('aria-selected', t.dataset.tab === tab);
  });

  ['overview', 'ingredients', 'steps'].forEach(p => {
    const panel = $(`panel-${p}`);
    if (panel) {
      panel.classList.toggle('active', p === tab);
      panel.classList.toggle('hidden', p !== tab);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════════
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(recipe) {
  const history = getHistory();
  const entry = {
    id: Date.now(),
    foodName: recipe.foodName,
    cuisine: recipe.cuisine,
    difficulty: recipe.difficulty,
    prepTime: recipe.prepTime,
    thumbnail: state.capturedImageBase64 ? `data:${state.capturedImageMimeType};base64,${state.capturedImageBase64.substring(0, 200)}` : null,
    fullData: recipe,
    detectedAt: new Date().toISOString(),
  };

  // Keep actual image for history (limit size)
  if (state.capturedImageBase64) {
    entry.thumbnailFull = `data:${state.capturedImageMimeType};base64,${state.capturedImageBase64}`;
  }

  history.unshift(entry);
  const trimmed = history.slice(0, MAX_HISTORY);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full — store without images
    const noImg = trimmed.map(h => ({ ...h, thumbnailFull: undefined }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(noImg));
  }
}

function renderHistory() {
  const history = getHistory();
  dom.historyList.innerHTML = '';

  if (history.length === 0) {
    dom.historyList.appendChild(dom.historyEmpty);
    dom.historyEmpty.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    return;
  }

  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    const timeAgo = formatTimeAgo(new Date(entry.detectedAt));

    let thumbHtml;
    if (entry.thumbnailFull) {
      thumbHtml = `<img class="history-thumb" src="${entry.thumbnailFull}" alt="${entry.foodName}" loading="lazy" />`;
    } else {
      thumbHtml = `<div class="history-thumb-placeholder"><i data-lucide="utensils"></i></div>`;
    }

    item.innerHTML = `
      ${thumbHtml}
      <div class="history-info">
        <div class="history-name">${entry.foodName}</div>
        <div class="history-meta">${entry.cuisine} · ${timeAgo}</div>
      </div>
      <div class="history-chevron"><i data-lucide="chevron-right"></i></div>
    `;

    item.addEventListener('click', () => {
      navigateTo('home');
      setTimeout(() => {
        displayRecipe(entry.fullData);

        // Restore image if available
        if (entry.thumbnailFull) {
          dom.previewImage.src = entry.thumbnailFull;
          dom.previewImage.classList.remove('hidden');
          dom.capturePlaceholder.classList.add('hidden');
          dom.previewOverlay.classList.remove('hidden');
          state.capturedImageBase64 = entry.thumbnailFull.split(',')[1];
          state.capturedImageMimeType = state.capturedImageMimeType || 'image/jpeg';
          dom.detectBtn.disabled = false;
        }
      }, 100);
    });

    dom.historyList.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

function clearHistory() {
  if (!confirm('Clear all recipe history?')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('History cleared', 'info');
}

function formatTimeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ══════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════
function toggleSaveRecipe() {
  const btn = dom.resultSaveBtn;
  const isSaved = btn.classList.toggle('saved');
  const icon = btn.querySelector('svg');

  if (isSaved) {
    if (icon) icon.setAttribute('data-lucide', 'bookmark-check');
    showToast('Recipe bookmarked!', 'success');
  } else {
    if (icon) icon.setAttribute('data-lucide', 'bookmark');
    showToast('Bookmark removed', 'info');
  }
  if (window.lucide) lucide.createIcons();
}

async function shareRecipe() {
  if (!state.currentResult) return;

  const recipe = state.currentResult;
  const text = `🍽️ ${recipe.foodName}
${recipe.description || ''}

⏱ ${recipe.prepTime} · 🔥 ${recipe.calories} · 📊 ${recipe.difficulty}

🥘 Ingredients:
${(recipe.ingredients || []).map(i => `• ${i.name}: ${i.amount}`).join('\n')}

👨‍🍳 Steps:
${(recipe.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Detected with MasLa AI Recipe Finder`;

  if (navigator.share) {
    try {
      await navigator.share({ title: recipe.foodName, text });
    } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Recipe copied to clipboard!', 'success');
    } catch {
      showToast('Could not share recipe', 'error');
    }
  }
}

function resetToCapture() {
  dom.resultCard.classList.add('hidden');
  clearImage();
  document.querySelector('.app-main').scrollTop = 0;
}

// ══════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════
function showToast(message, type = 'info', duration = 3000) {
  const iconMap = {
    success: 'check-circle',
    error:   'alert-circle',
    info:    'info',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${iconMap[type]}"></i><span>${message}</span>`;

  dom.toastContainer.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
