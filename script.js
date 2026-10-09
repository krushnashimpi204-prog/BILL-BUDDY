/**
 * Bills Buddy - Vanilla JavaScript Implementation
 * Clean, single-instance architecture
 */

// Flush any stale Service Worker caches to ensure fresh styles and UI
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
}

const STORAGE_ACTIVE_KEY = 'bills_buddy_active_state_v4';
const STORAGE_HISTORY_KEY = 'bills_buddy_saved_bills_v4';

// Minimalist, elegant palette for avatar circles (grey, light blue, soft slate, teal)
const AVATAR_PALETTE = [
  { bg: '#d0e2ec', text: '#1e4258', border: '#b2cddf' },
  { bg: '#e2e8f0', text: '#334155', border: '#cbd5e1' },
  { bg: '#cde4e1', text: '#194943', border: '#b0d6d2' },
  { bg: '#e5e1ea', text: '#433857', border: '#d1cad9' },
  { bg: '#e8ecef', text: '#2d3748', border: '#cbd5e0' },
  { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  { bg: '#e2ece9', text: '#284e44', border: '#c3dbd5' },
  { bg: '#eedfd5', text: '#613b28', border: '#dfc7b7' },
];

function getAvatarColors(index) {
  const i = Math.max(0, (index - 1) % AVATAR_PALETTE.length);
  return AVATAR_PALETTE[i];
}

/**
 * Computes initials for avatar circles:
 * - "Person 1" -> "P1"
 * - "Person 2" -> "P2"
 * - "krushna shimpi" -> "KS"
 * - "Alex" -> "AL"
 * - Empty / default -> "P{fallbackIndex}"
 */
function getInitials(name, fallbackIndex) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return `P${fallbackIndex}`;
  }
  const clean = name.trim();

  const personMatch = clean.match(/^person\s*(\d+)$/i);
  if (personMatch) {
    return `P${personMatch[1]}`;
  }

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].length >= 2 ? parts[0].slice(0, 2).toUpperCase() : parts[0][0].toUpperCase();
  }

  const firstLetter = parts[0][0];
  const lastLetter = parts[parts.length - 1][0];
  return (firstLetter + lastLetter).toUpperCase();
}

// DOM Elements
const occasionInput = document.getElementById('occasion');
const venueInput = document.getElementById('venue-name');
const occasionTypeSelect = document.getElementById('occasion-type');
const occasionDateInput = document.getElementById('occasion-date');
const currencySelect = document.getElementById('currency-select');
const currencyPrefixDisplay = document.getElementById('currency-symbol-display');
const billInput = document.getElementById('bill-amount');
const peopleInput = document.getElementById('num-people');

// Split mode tabs & dynamic people container
const modeEqualBtn = document.getElementById('mode-equal-btn');
const modeCustomBtn = document.getElementById('mode-custom-btn');
const peopleInputsContainer = document.getElementById('people-inputs-container');
const btnIncPeople = document.getElementById('btn-inc-people');
const btnDecPeople = document.getElementById('btn-dec-people');
const customDistributionTools = document.getElementById('custom-distribution-tools');
const btnBalanceRemaining = document.getElementById('btn-balance-remaining');

// Form Actions
const splitBtn = document.getElementById('split-btn');
const saveBillBtn = document.getElementById('save-bill-btn');
const resetBtn = document.getElementById('reset-btn');

// Alert Box
const alertBox = document.getElementById('alert-box');
const alertText = document.getElementById('alert-text');

// Results Elements
const resultsSection = document.getElementById('results-section');
const occasionDisplay = document.getElementById('occasion-display');
const venueMetaDisplay = document.getElementById('venue-meta-display');
const summaryBill = document.getElementById('summary-bill');
const summaryPeople = document.getElementById('summary-people');
const summarySplitType = document.getElementById('summary-split-type');
const summaryBaseShare = document.getElementById('summary-base-share');

const seriesCountLabel = document.getElementById('series-count-label');
const stackedAvatarsContainer = document.getElementById('stacked-avatars-container');
const splittersSeriesContainer = document.getElementById('splitters-series-container');

const sharesListBody = document.getElementById('shares-list-body');
const totalSharesSum = document.getElementById('total-shares-sum');
const verificationCard = document.getElementById('verification-card');
const verificationText = document.getElementById('verification-text');
const remainderExplanation = document.getElementById('remainder-explanation');

const downloadBillBtn = document.getElementById('download-bill-btn');
const saveCurrentResultBtn = document.getElementById('save-current-result-btn');
const printBillBtn = document.getElementById('print-bill-btn');

// Saved Bills Modal
const openSavedBtn = document.getElementById('open-saved-btn');
const savedBillsBadge = document.getElementById('saved-bills-badge');
const savedBillsModal = document.getElementById('saved-bills-modal');
const closeSavedModalBtn = document.getElementById('close-saved-modal-btn');
const closeModalFooterBtn = document.getElementById('close-modal-footer-btn');
const savedBillsList = document.getElementById('saved-bills-list');
const clearAllSavedBtn = document.getElementById('clear-all-saved-btn');

// Offline & PWA Elements
const offlineIndicator = document.getElementById('offline-indicator');
const offlineText = document.getElementById('offline-text');
const installAppBtn = document.getElementById('install-app-btn');

// Application State
let currentSplitMode = 'equal';
let participantsData = [];
let lastCalculatedResult = null;
let deferredInstallPrompt = null;

function formatCurrency(amount, symbol = null) {
  const sym = symbol !== null ? symbol : (currencySelect ? currencySelect.value : '$');
  const num = Number(amount) || 0;
  return `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initializeDefaultDate() {
  if (occasionDateInput && !occasionDateInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    occasionDateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

function showError(message, type = 'error') {
  alertText.textContent = message;
  alertBox.className = `alert-box alert-${type}`;
  alertBox.classList.remove('hidden');
  if (type === 'error') {
    resultsSection.classList.add('hidden');
    lastCalculatedResult = null;
  }
}

function clearError() {
  alertBox.classList.add('hidden');
  alertText.textContent = '';
}

function handleCurrencyChange() {
  const sym = currencySelect.value;
  currencyPrefixDisplay.textContent = sym;
  renderPeopleInputs();
  if (lastCalculatedResult && !resultsSection.classList.contains('hidden')) {
    handleCalculate(false);
  }
}

function syncParticipantsCount(count) {
  const targetCount = Math.max(1, Math.min(100, count));
  peopleInput.value = targetCount;

  const updated = [];
  for (let i = 0; i < targetCount; i++) {
    if (participantsData[i]) {
      updated.push(participantsData[i]);
    } else {
      updated.push({
        id: i + 1,
        name: '',
        customShare: '',
      });
    }
  }
  participantsData = updated;
  renderPeopleInputs();
}

function renderPeopleInputs() {
  peopleInputsContainer.innerHTML = '';
  const currentSymbol = currencySelect.value;

  participantsData.forEach((person, index) => {
    const card = document.createElement('div');
    card.className = 'person-input-card';

    const colors = getAvatarColors(index + 1);
    const initials = getInitials(person.name, index + 1);

    const topRow = document.createElement('div');
    topRow.className = 'person-card-top';

    const avatar = document.createElement('div');
    avatar.className = 'avatar-circle';
    avatar.style.backgroundColor = colors.bg;
    avatar.style.color = colors.text;
    avatar.style.borderColor = colors.border;
    avatar.textContent = initials;
    avatar.id = `input-avatar-${index + 1}`;
    topRow.appendChild(avatar);

    const metaWrap = document.createElement('div');
    metaWrap.className = 'person-card-meta';

    const label = document.createElement('div');
    label.className = 'person-card-label';
    label.textContent = `Participant ${index + 1}`;

    const namePreview = document.createElement('div');
    namePreview.className = 'person-card-name-preview';
    namePreview.id = `input-preview-name-${index + 1}`;
    namePreview.textContent = person.name || `Person ${index + 1}`;

    metaWrap.appendChild(label);
    metaWrap.appendChild(namePreview);
    topRow.appendChild(metaWrap);
    card.appendChild(topRow);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = `e.g., Krushna Shimpi or Person ${index + 1}`;
    nameInput.value = person.name || '';
    nameInput.addEventListener('input', (e) => {
      person.name = e.target.value.trim();
      avatar.textContent = getInitials(person.name, index + 1);
      namePreview.textContent = person.name || `Person ${index + 1}`;
      saveActiveState();
    });
    card.appendChild(nameInput);

    if (currentSplitMode === 'custom') {
      const customWrap = document.createElement('div');
      customWrap.className = 'custom-share-input-wrap';

      const customLabel = document.createElement('label');
      customLabel.textContent = `Share Amount (${currentSymbol}):`;
      customWrap.appendChild(customLabel);

      const customInputWrap = document.createElement('div');
      customInputWrap.className = 'input-wrapper';

      const prefixSpan = document.createElement('span');
      prefixSpan.className = 'currency-prefix';
      prefixSpan.textContent = currentSymbol;
      customInputWrap.appendChild(prefixSpan);

      const shareInput = document.createElement('input');
      shareInput.type = 'number';
      shareInput.className = 'has-prefix';
      shareInput.step = '0.01';
      shareInput.min = '0';
      shareInput.placeholder = '0.00';
      shareInput.value = person.customShare !== '' && person.customShare !== undefined ? person.customShare : '';
      shareInput.addEventListener('input', (e) => {
        person.customShare = e.target.value;
        saveActiveState();
      });
      customInputWrap.appendChild(shareInput);
      customWrap.appendChild(customInputWrap);

      card.appendChild(customWrap);
    }

    peopleInputsContainer.appendChild(card);
  });

  if (currentSplitMode === 'custom') {
    customDistributionTools.classList.remove('hidden');
  } else {
    customDistributionTools.classList.add('hidden');
  }
}

function distributeRemainingEvenly() {
  clearError();
  const rawBill = billInput.value;
  const billVal = parseFloat(rawBill);

  if (isNaN(billVal) || billVal <= 0) {
    showError('Please enter a valid total bill amount before balancing shares.');
    return;
  }

  const totalCents = Math.round(billVal * 100);
  let assignedCents = 0;
  const unassignedIndices = [];

  participantsData.forEach((person, idx) => {
    const rawVal = String(person.customShare || '').trim();
    if (rawVal !== '' && !isNaN(parseFloat(rawVal))) {
      assignedCents += Math.round(parseFloat(rawVal) * 100);
    } else {
      unassignedIndices.push(idx);
    }
  });

  const remainingCents = totalCents - assignedCents;

  if (unassignedIndices.length === 0) {
    showError('All participants already have specified shares. Clear some amounts to re-balance.');
    return;
  }

  if (remainingCents < 0) {
    showError(`Specified shares (${formatCurrency(assignedCents / 100)}) exceed the total bill (${formatCurrency(billVal)}). Please adjust.`);
    return;
  }

  const baseCentsPerPerson = Math.floor(remainingCents / unassignedIndices.length);
  const remainderCents = remainingCents % unassignedIndices.length;

  unassignedIndices.forEach((personIdx, i) => {
    const shareCents = i < remainderCents ? baseCentsPerPerson + 1 : baseCentsPerPerson;
    participantsData[personIdx].customShare = (shareCents / 100).toFixed(2);
  });

  renderPeopleInputs();
  saveActiveState();
  showError(`Remaining ${formatCurrency(remainingCents / 100)} distributed across ${unassignedIndices.length} participant(s).`, 'success');
}

function validateInputs() {
  const billRaw = billInput.value;
  const peopleRaw = peopleInput.value;

  if (billRaw === null || billRaw === undefined || String(billRaw).trim() === '') {
    return { valid: false, message: 'Please enter a bill amount.' };
  }

  const billVal = parseFloat(billRaw);
  if (isNaN(billVal)) {
    return { valid: false, message: 'Please enter a valid numeric bill amount.' };
  }

  if (billVal <= 0) {
    return { valid: false, message: 'The bill amount must be greater than zero.' };
  }

  if (peopleRaw === null || peopleRaw === undefined || String(peopleRaw).trim() === '') {
    return { valid: false, message: 'Please enter the number of people.' };
  }

  const peopleVal = Number(peopleRaw);
  if (isNaN(peopleVal)) {
    return { valid: false, message: 'Please enter a valid number of people.' };
  }

  if (peopleVal <= 0) {
    return { valid: false, message: 'The number of people must be at least 1.' };
  }

  if (!Number.isInteger(peopleVal)) {
    return { valid: false, message: 'The number of people must be a whole number.' };
  }

  return {
    valid: true,
    bill: billVal,
    people: peopleVal,
  };
}

function handleCalculate(triggerScroll = true) {
  clearError();

  const validation = validateInputs();
  if (!validation.valid) {
    showError(validation.message);
    return;
  }

  const { bill, people } = validation;
  const currentSymbol = currencySelect.value;
  const occasion = occasionInput.value.trim() || 'Dinner & Gathering';
  const venue = venueInput.value.trim() || 'Restaurant / Cafe';
  const occasionType = occasionTypeSelect.value;
  const occasionDate = occasionDateInput.value || new Date().toISOString().split('T')[0];

  const totalCents = Math.round(bill * 100);
  const shares = [];
  let calculatedCentsSum = 0;
  let splitExplanation = '';

  if (currentSplitMode === 'equal') {
    const baseCents = Math.floor(totalCents / people);
    const remainderCents = totalCents % people;

    for (let i = 0; i < people; i++) {
      const personData = participantsData[i] || { name: `Person ${i + 1}` };
      const displayName = personData.name && personData.name.trim() !== '' ? personData.name : `Person ${i + 1}`;
      const initials = getInitials(displayName, i + 1);
      const personCents = i < remainderCents ? baseCents + 1 : baseCents;

      shares.push({
        personIndex: i + 1,
        name: displayName,
        initials: initials,
        amount: personCents / 100,
        cents: personCents,
        statusNote: i < remainderCents ? 'Exact penny balance (+0.01)' : 'Standard equal share',
        isAdjusted: false,
      });

      calculatedCentsSum += personCents;
    }

    if (remainderCents > 0) {
      const higher = formatCurrency((baseCents + 1) / 100, currentSymbol);
      const regular = formatCurrency(baseCents / 100, currentSymbol);
      splitExplanation = `Exact Penny Balance: ${remainderCents} ${
        remainderCents === 1 ? 'person pays' : 'people pay'
      } ${higher} and ${people - remainderCents} ${
        people - remainderCents === 1 ? 'person pays' : 'people pay'
      } ${regular}. Exact sum matches ${formatCurrency(bill, currentSymbol)}.`;
    } else {
      splitExplanation = `The bill splits completely evenly at ${formatCurrency(baseCents / 100, currentSymbol)} per person.`;
    }
  } else {
    let allFilled = true;
    for (let i = 0; i < people; i++) {
      const personData = participantsData[i] || { name: `Person ${i + 1}`, customShare: '' };
      const displayName = personData.name && personData.name.trim() !== '' ? personData.name : `Person ${i + 1}`;
      const initials = getInitials(displayName, i + 1);
      const rawShare = String(personData.customShare || '').trim();

      if (rawShare === '' || isNaN(parseFloat(rawShare))) {
        allFilled = false;
        break;
      }

      const shareVal = parseFloat(rawShare);
      if (shareVal < 0) {
        showError(`Share for ${displayName} cannot be negative.`);
        return;
      }

      const shareCents = Math.round(shareVal * 100);
      calculatedCentsSum += shareCents;

      const avgShare = bill / people;
      let note = 'Custom share';
      if (shareVal < avgShare - 0.01) {
        note = 'Paying less than average';
      } else if (shareVal > avgShare + 0.01) {
        note = 'Paying more than average';
      } else {
        note = 'Average share';
      }

      shares.push({
        personIndex: i + 1,
        name: displayName,
        initials: initials,
        amount: shareCents / 100,
        cents: shareCents,
        statusNote: note,
        isAdjusted: true,
      });
    }

    if (!allFilled) {
      showError('Please enter a share amount for every participant, or click "Distribute Remaining Bill Evenly" to balance.');
      return;
    }

    const differenceCents = calculatedCentsSum - totalCents;
    if (differenceCents !== 0) {
      const diffFormatted = formatCurrency(Math.abs(differenceCents) / 100, currentSymbol);
      if (differenceCents > 0) {
        showError(`Total allocated shares (${formatCurrency(calculatedCentsSum / 100, currentSymbol)}) exceed total bill (${formatCurrency(bill, currentSymbol)}) by ${diffFormatted}. Please adjust.`);
      } else {
        showError(`Total allocated shares (${formatCurrency(calculatedCentsSum / 100, currentSymbol)}) are less than total bill (${formatCurrency(bill, currentSymbol)}) by ${diffFormatted}. Click "Distribute Remaining" to balance.`);
      }
      return;
    }

    splitExplanation = `Custom Split: Individual shares add up exactly to ${formatCurrency(bill, currentSymbol)}.`;
  }

  // Populate Results UI
  occasionDisplay.textContent = occasion;
  venueMetaDisplay.textContent = `${venue} \u2022 ${occasionType} \u2022 ${occasionDate}`;

  summaryBill.textContent = formatCurrency(bill, currentSymbol);
  summaryPeople.textContent = `${people} ${people === 1 ? 'person' : 'people'}`;
  summarySplitType.textContent = currentSplitMode === 'equal' ? 'Equal Split' : 'Custom Shares';
  summaryBaseShare.textContent = formatCurrency(bill / people, currentSymbol);

  // RENDER OVERLAPPING CIRCLES IN SERIES
  seriesCountLabel.textContent = `${shares.length} Splitters`;
  stackedAvatarsContainer.innerHTML = '';
  splittersSeriesContainer.innerHTML = '';

  shares.forEach((share, index) => {
    const colors = getAvatarColors(share.personIndex);

    const stackedCircle = document.createElement('div');
    stackedCircle.className = 'stacked-avatar-item';
    stackedCircle.style.backgroundColor = colors.bg;
    stackedCircle.style.color = colors.text;
    stackedCircle.style.borderColor = colors.border;
    stackedCircle.style.zIndex = index + 1;
    stackedCircle.textContent = share.initials;
    stackedCircle.title = `${share.name}: ${formatCurrency(share.amount, currentSymbol)} (${share.statusNote})`;
    stackedAvatarsContainer.appendChild(stackedCircle);

    const chip = document.createElement('div');
    chip.className = 'splitter-series-chip';

    const chipAvatar = document.createElement('div');
    chipAvatar.className = 'avatar-circle-sm';
    chipAvatar.style.backgroundColor = colors.bg;
    chipAvatar.style.color = colors.text;
    chipAvatar.style.borderColor = colors.border;
    chipAvatar.textContent = share.initials;

    const chipInfo = document.createElement('div');
    chipInfo.className = 'splitter-chip-info';

    const chipName = document.createElement('span');
    chipName.className = 'splitter-chip-name';
    chipName.textContent = share.name;

    const chipAmount = document.createElement('span');
    chipAmount.className = 'splitter-chip-amount';
    chipAmount.textContent = formatCurrency(share.amount, currentSymbol);

    chipInfo.appendChild(chipName);
    chipInfo.appendChild(chipAmount);

    chip.appendChild(chipAvatar);
    chip.appendChild(chipInfo);
    splittersSeriesContainer.appendChild(chip);
  });

  // Populate Shares Table
  sharesListBody.innerHTML = '';
  shares.forEach((share) => {
    const colors = getAvatarColors(share.personIndex);
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'person-name-cell';

    const cellWrap = document.createElement('div');
    cellWrap.className = 'person-cell-wrap';

    const avatarSm = document.createElement('div');
    avatarSm.className = 'avatar-circle-sm';
    avatarSm.style.backgroundColor = colors.bg;
    avatarSm.style.color = colors.text;
    avatarSm.style.borderColor = colors.border;
    avatarSm.textContent = share.initials;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = share.name;

    cellWrap.appendChild(avatarSm);
    cellWrap.appendChild(nameSpan);
    tdName.appendChild(cellWrap);

    const tdNote = document.createElement('td');
    tdNote.className = 'person-note-cell';
    tdNote.textContent = share.statusNote;

    const tdAmount = document.createElement('td');
    tdAmount.className = 'person-share-amount text-right';
    tdAmount.textContent = formatCurrency(share.amount, currentSymbol);

    tr.appendChild(tdName);
    tr.appendChild(tdNote);
    tr.appendChild(tdAmount);
    sharesListBody.appendChild(tr);
  });

  const totalCollected = calculatedCentsSum / 100;
  totalSharesSum.textContent = formatCurrency(totalCollected, currentSymbol);

  verificationCard.className = 'exact-verification';
  verificationText.textContent = `\u2713 Verification: Shares (${formatCurrency(totalCollected, currentSymbol)}) add up exactly to the bill.`;
  remainderExplanation.textContent = splitExplanation;

  resultsSection.classList.remove('hidden');

  lastCalculatedResult = {
    occasion,
    venue,
    occasionType,
    occasionDate,
    currency: currentSymbol,
    totalBill: bill,
    partySize: people,
    splitMode: currentSplitMode,
    shares,
    totalCollected,
    timestamp: new Date().toISOString(),
  };

  saveActiveState();

  if (triggerScroll) {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function saveBillToHistory() {
  if (!lastCalculatedResult) {
    handleCalculate(false);
    if (!lastCalculatedResult) return;
  }

  try {
    const history = getSavedBillsHistory();
    const billToSave = {
      id: 'bill_' + Date.now(),
      ...lastCalculatedResult,
    };

    history.unshift(billToSave);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    updateSavedBillsBadge();
    showError(`"${billToSave.occasion}" saved to your Bills Buddy history!`, 'success');
  } catch (e) {
    console.error('Failed to save bill:', e);
    showError('Could not save bill to local storage.');
  }
}

function getSavedBillsHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function updateSavedBillsBadge() {
  const history = getSavedBillsHistory();
  if (savedBillsBadge) {
    savedBillsBadge.textContent = history.length;
  }
}

function openSavedBillsModal() {
  const history = getSavedBillsHistory();
  savedBillsList.innerHTML = '';

  if (history.length === 0) {
    savedBillsList.innerHTML = '<div class="empty-saved-message">No saved bills yet. Calculate a split and click "Save Bill" to keep a history here!</div>';
  } else {
    history.forEach((bill) => {
      const card = document.createElement('div');
      card.className = 'saved-bill-card';

      const topRow = document.createElement('div');
      topRow.className = 'saved-bill-top';
      topRow.innerHTML = `
        <span class="saved-bill-title">${bill.occasion}</span>
        <span class="saved-bill-total">${formatCurrency(bill.totalBill, bill.currency)}</span>
      `;
      card.appendChild(topRow);

      const meta = document.createElement('div');
      meta.className = 'saved-bill-meta';
      meta.textContent = `${bill.venue || 'Hotel/Cafe'} \u2022 ${bill.occasionType || 'Gathering'} \u2022 ${bill.occasionDate || 'No date'} \u2022 ${bill.partySize} People`;
      card.appendChild(meta);

      if (Array.isArray(bill.shares) && bill.shares.length > 0) {
        const stackedWrap = document.createElement('div');
        stackedWrap.className = 'saved-bill-stacked-avatars';

        bill.shares.forEach((s, idx) => {
          const colors = getAvatarColors(s.personIndex || idx + 1);
          const circle = document.createElement('div');
          circle.className = 'stacked-avatar-item';
          circle.style.width = '32px';
          circle.style.height = '32px';
          circle.style.fontSize = '0.75rem';
          circle.style.marginLeft = idx === 0 ? '0' : '-8px';
          circle.style.zIndex = idx + 1;
          circle.style.backgroundColor = colors.bg;
          circle.style.color = colors.text;
          circle.style.borderColor = colors.border;
          circle.textContent = s.initials || getInitials(s.name, idx + 1);
          circle.title = `${s.name}: ${formatCurrency(s.amount, bill.currency)}`;
          stackedWrap.appendChild(circle);
        });

        card.appendChild(stackedWrap);
      }

      const sharesContainer = document.createElement('div');
      sharesContainer.className = 'saved-bill-shares';
      bill.shares.forEach((s, idx) => {
        const colors = getAvatarColors(s.personIndex || idx + 1);
        const initials = s.initials || getInitials(s.name, idx + 1);

        const row = document.createElement('div');
        row.className = 'saved-bill-share-row';

        const userWrap = document.createElement('div');
        userWrap.className = 'saved-bill-user-wrap';

        const avatarSm = document.createElement('div');
        avatarSm.className = 'avatar-circle-sm';
        avatarSm.style.backgroundColor = colors.bg;
        avatarSm.style.color = colors.text;
        avatarSm.style.borderColor = colors.border;
        avatarSm.textContent = initials;

        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = `${s.name} <small style="color: var(--text-muted);">(${s.statusNote})</small>`;

        userWrap.appendChild(avatarSm);
        userWrap.appendChild(nameSpan);

        const amtSpan = document.createElement('strong');
        amtSpan.style.color = 'var(--blue-primary)';
        amtSpan.textContent = formatCurrency(s.amount, bill.currency);

        row.appendChild(userWrap);
        row.appendChild(amtSpan);
        sharesContainer.appendChild(row);
      });
      card.appendChild(sharesContainer);

      const actions = document.createElement('div');
      actions.className = 'saved-bill-actions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-primary';
      loadBtn.textContent = 'Load into Form';
      loadBtn.addEventListener('click', () => {
        loadSavedBill(bill);
        closeSavedBillsModal();
      });
      actions.appendChild(loadBtn);

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'btn-secondary';
      downloadBtn.textContent = 'Download Receipt';
      downloadBtn.addEventListener('click', () => {
        downloadReceiptFile(bill);
      });
      actions.appendChild(downloadBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-secondary';
      deleteBtn.style.color = 'var(--error-text)';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        deleteSavedBill(bill.id);
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      savedBillsList.appendChild(card);
    });
  }

  savedBillsModal.classList.remove('hidden');
}

function closeSavedBillsModal() {
  savedBillsModal.classList.add('hidden');
}

function loadSavedBill(bill) {
  occasionInput.value = bill.occasion || '';
  venueInput.value = bill.venue || '';
  occasionTypeSelect.value = bill.occasionType || 'Dinner';
  occasionDateInput.value = bill.occasionDate || '';
  currencySelect.value = bill.currency || '$';
  currencyPrefixDisplay.textContent = bill.currency || '$';
  billInput.value = bill.totalBill || '';
  peopleInput.value = bill.partySize || bill.shares.length;

  currentSplitMode = bill.splitMode || 'equal';
  if (currentSplitMode === 'equal') {
    modeEqualBtn.classList.add('active');
    modeEqualBtn.setAttribute('aria-selected', 'true');
    modeCustomBtn.classList.remove('active');
    modeCustomBtn.setAttribute('aria-selected', 'false');
  } else {
    modeCustomBtn.classList.add('active');
    modeCustomBtn.setAttribute('aria-selected', 'true');
    modeEqualBtn.classList.remove('active');
    modeEqualBtn.setAttribute('aria-selected', 'false');
  }

  participantsData = bill.shares.map((s, idx) => ({
    id: idx + 1,
    name: s.name,
    customShare: s.amount !== undefined ? s.amount.toString() : '',
  }));

  renderPeopleInputs();
  handleCalculate(true);
  showError(`Loaded "${bill.occasion}" from history.`, 'success');
}

function deleteSavedBill(id) {
  const history = getSavedBillsHistory().filter((b) => b.id !== id);
  localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
  updateSavedBillsBadge();
  openSavedBillsModal();
}

function clearAllSavedBills() {
  if (confirm('Are you sure you want to delete all saved bills?')) {
    localStorage.removeItem(STORAGE_HISTORY_KEY);
    updateSavedBillsBadge();
    openSavedBillsModal();
  }
}

function downloadReceiptFile(billData = null) {
  const bill = billData || lastCalculatedResult;
  if (!bill) {
    handleCalculate(false);
    if (!lastCalculatedResult) return;
  }

  const activeBill = billData || lastCalculatedResult;
  const sym = activeBill.currency || '$';

  let receiptText = '';
  receiptText += '===================================================\n';
  receiptText += '               BILLS BUDDY RECEIPT                 \n';
  receiptText += '===================================================\n';
  receiptText += `Occasion:      ${activeBill.occasion}\n`;
  receiptText += `Venue/Hotel:   ${activeBill.venue}\n`;
  receiptText += `Category:      ${activeBill.occasionType}\n`;
  receiptText += `Date:          ${activeBill.occasionDate}\n`;
  receiptText += `Split Mode:    ${activeBill.splitMode === 'equal' ? 'Equal Split (Exact)' : 'Custom Shares'}\n`;
  receiptText += '---------------------------------------------------\n';
  receiptText += `Total Bill:    ${formatCurrency(activeBill.totalBill, sym)}\n`;
  receiptText += `Party Size:    ${activeBill.partySize} Participants\n`;
  receiptText += '---------------------------------------------------\n';
  receiptText += 'INDIVIDUAL PAYMENT SHARES:\n';

  activeBill.shares.forEach((share, idx) => {
    const padName = (share.name + ' '.repeat(24)).slice(0, 24);
    const padAmt = formatCurrency(share.amount, sym);
    receiptText += `  ${idx + 1}. ${padName} : ${padAmt} [${share.statusNote}]\n`;
  });

  receiptText += '---------------------------------------------------\n';
  receiptText += `TOTAL COLLECTED: ${formatCurrency(activeBill.totalCollected, sym)}\n`;
  receiptText += 'VERIFICATION:    EXACT MATCH (Zero discrepancies)\n';
  receiptText += '===================================================\n';
  receiptText += 'Generated by Bills Buddy - Offline Web App\n';

  const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (activeBill.occasion || 'bill').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.href = url;
  a.download = `bills_buddy_${safeName}_${activeBill.occasionDate || 'date'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function saveActiveState() {
  try {
    const state = {
      occasion: occasionInput.value,
      venue: venueInput.value,
      occasionType: occasionTypeSelect.value,
      occasionDate: occasionDateInput.value,
      currency: currencySelect.value,
      bill: billInput.value,
      people: peopleInput.value,
      splitMode: currentSplitMode,
      participants: participantsData,
      hasCalculated: !resultsSection.classList.contains('hidden'),
    };
    localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save active state:', e);
  }
}

function restoreActiveState() {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (!raw) {
      initializeDefaultDate();
      syncParticipantsCount(3);
      updateSavedBillsBadge();
      return;
    }

    const state = JSON.parse(raw);
    if (state) {
      occasionInput.value = state.occasion || '';
      venueInput.value = state.venue || '';
      occasionTypeSelect.value = state.occasionType || 'Dinner';
      occasionDateInput.value = state.occasionDate || '';
      currencySelect.value = state.currency || '$';
      currencyPrefixDisplay.textContent = state.currency || '$';
      billInput.value = state.bill || '';
      
      const count = parseInt(state.people, 10) || 3;
      peopleInput.value = count;

      if (state.splitMode === 'custom') {
        currentSplitMode = 'custom';
        modeCustomBtn.classList.add('active');
        modeCustomBtn.setAttribute('aria-selected', 'true');
        modeEqualBtn.classList.remove('active');
        modeEqualBtn.setAttribute('aria-selected', 'false');
      } else {
        currentSplitMode = 'equal';
        modeEqualBtn.classList.add('active');
        modeEqualBtn.setAttribute('aria-selected', 'true');
        modeCustomBtn.classList.remove('active');
        modeCustomBtn.setAttribute('aria-selected', 'false');
      }

      if (Array.isArray(state.participants) && state.participants.length > 0) {
        participantsData = state.participants;
        renderPeopleInputs();
      } else {
        syncParticipantsCount(count);
      }

      if (state.hasCalculated && state.bill && count) {
        handleCalculate(false);
      }
    }
  } catch (e) {
    console.warn('Error restoring state:', e);
    initializeDefaultDate();
    syncParticipantsCount(3);
  }
  updateSavedBillsBadge();
}

function handleReset() {
  occasionInput.value = '';
  venueInput.value = '';
  occasionTypeSelect.value = 'Dinner';
  initializeDefaultDate();
  currencySelect.value = '$';
  currencyPrefixDisplay.textContent = '$';
  billInput.value = '';
  peopleInput.value = '3';

  currentSplitMode = 'equal';
  modeEqualBtn.classList.add('active');
  modeEqualBtn.setAttribute('aria-selected', 'true');
  modeCustomBtn.classList.remove('active');
  modeCustomBtn.setAttribute('aria-selected', 'false');

  clearError();
  resultsSection.classList.add('hidden');
  lastCalculatedResult = null;

  syncParticipantsCount(3);
  localStorage.removeItem(STORAGE_ACTIVE_KEY);
  occasionInput.focus();
}

function initOfflineCapabilities() {
  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineIndicator.title = 'All features work offline without an internet connection.';
      offlineText.textContent = 'Offline Ready';
      offlineIndicator.querySelector('.status-dot').style.backgroundColor = '#22c55e';
    } else {
      offlineIndicator.title = 'You are currently offline. Bills Buddy works seamlessly offline!';
      offlineText.textContent = 'Offline Mode';
      offlineIndicator.querySelector('.status-dot').style.backgroundColor = '#f59e0b';
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installAppBtn) {
      installAppBtn.classList.remove('hidden');
    }
  });

  if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        installAppBtn.classList.add('hidden');
      }
      deferredInstallPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installAppBtn) {
      installAppBtn.classList.add('hidden');
    }
  });
}

// Event Listeners
splitBtn.addEventListener('click', () => handleCalculate(true));
saveBillBtn.addEventListener('click', saveBillToHistory);
saveCurrentResultBtn.addEventListener('click', saveBillToHistory);
resetBtn.addEventListener('click', handleReset);

downloadBillBtn.addEventListener('click', () => downloadReceiptFile(null));
printBillBtn.addEventListener('click', () => window.print());

openSavedBtn.addEventListener('click', openSavedBillsModal);
closeSavedModalBtn.addEventListener('click', closeSavedBillsModal);
closeModalFooterBtn.addEventListener('click', closeSavedBillsModal);
clearAllSavedBtn.addEventListener('click', clearAllSavedBills);

modeEqualBtn.addEventListener('click', () => {
  if (currentSplitMode !== 'equal') {
    currentSplitMode = 'equal';
    modeEqualBtn.classList.add('active');
    modeEqualBtn.setAttribute('aria-selected', 'true');
    modeCustomBtn.classList.remove('active');
    modeCustomBtn.setAttribute('aria-selected', 'false');
    renderPeopleInputs();
    saveActiveState();
    if (!resultsSection.classList.contains('hidden')) {
      handleCalculate(false);
    }
  }
});

modeCustomBtn.addEventListener('click', () => {
  if (currentSplitMode !== 'custom') {
    currentSplitMode = 'custom';
    modeCustomBtn.classList.add('active');
    modeCustomBtn.setAttribute('aria-selected', 'true');
    modeEqualBtn.classList.remove('active');
    modeEqualBtn.setAttribute('aria-selected', 'false');
    renderPeopleInputs();
    saveActiveState();
  }
});

peopleInput.addEventListener('input', (e) => {
  const count = parseInt(e.target.value, 10);
  if (!isNaN(count) && count >= 1 && count <= 100) {
    syncParticipantsCount(count);
    saveActiveState();
  }
});

btnIncPeople.addEventListener('click', () => {
  const current = parseInt(peopleInput.value, 10) || 1;
  if (current < 100) {
    syncParticipantsCount(current + 1);
    saveActiveState();
  }
});

btnDecPeople.addEventListener('click', () => {
  const current = parseInt(peopleInput.value, 10) || 1;
  if (current > 1) {
    syncParticipantsCount(current - 1);
    saveActiveState();
  }
});

btnBalanceRemaining.addEventListener('click', distributeRemainingEvenly);

currencySelect.addEventListener('change', () => {
  handleCurrencyChange();
  saveActiveState();
});

[occasionInput, venueInput, occasionTypeSelect, occasionDateInput, billInput].forEach((input) => {
  input.addEventListener('input', saveActiveState);
});

[occasionInput, venueInput, billInput, peopleInput].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCalculate(true);
    }
  });
});

savedBillsModal.addEventListener('click', (e) => {
  if (e.target === savedBillsModal) {
    closeSavedBillsModal();
  }
});

function initApp() {
  restoreActiveState();
  initOfflineCapabilities();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
