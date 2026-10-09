/**
 * Bills Buddy - Vanilla JavaScript Implementation
 * 100% Self-Contained, Bulletproof, Zero-Crash Architecture
 * 
 * Core Features:
 * 1. Takes occasion name, venue/hotel/cafe, date, bill amount, number of people
 * 2. Calculate button shows each person's exact share
 * 3. Shows each person's share with exact penny allocation (shares sum === total bill exactly!)
 * 4. Shows clear error message and NO result if bill or number of people is empty, zero, or negative
 * 5. Still shows the result after the page is reloaded (persistent localStorage)
 * 6. Avatar circles with dynamic initials (e.g., Person 1 -> P1, krushna shimpi -> KS)
 * 7. Overlapping series of circles showing splitters increasing and their exact split amounts
 * 8. Custom split / pays less adjustments with remaining balance distribution
 * 9. Saved bills history with avatar circles & downloadable formatted text receipt (.txt)
 */

(function () {
  'use strict';

  // Safely cleanup stale service workers without throwing in restricted or file:// environments
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        if (registrations && registrations.length) {
          for (var i = 0; i < registrations.length; i++) {
            registrations[i].unregister();
          }
        }
      }).catch(function () {});
    }
  } catch (e) {}

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then(function (names) {
        if (names && names.length) {
          for (var j = 0; j < names.length; j++) {
            caches.delete(names[j]);
          }
        }
      }).catch(function () {});
    }
  } catch (e) {}

  var STORAGE_ACTIVE_KEY = 'bills_buddy_active_state_v4';
  var STORAGE_HISTORY_KEY = 'bills_buddy_saved_bills_v4';

  var AVATAR_PALETTE = [
    { bg: '#d0e2ec', text: '#1e4258', border: '#b2cddf' },
    { bg: '#e2e8f0', text: '#334155', border: '#cbd5e1' },
    { bg: '#cde4e1', text: '#194943', border: '#b0d6d2' },
    { bg: '#e5e1ea', text: '#433857', border: '#d1cad9' },
    { bg: '#e8ecef', text: '#2d3748', border: '#cbd5e0' },
    { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
    { bg: '#e2ece9', text: '#284e44', border: '#c3dbd5' },
    { bg: '#eedfd5', text: '#613b28', border: '#dfc7b7' }
  ];

  function getAvatarColors(index) {
    var i = Math.max(0, (index - 1) % AVATAR_PALETTE.length);
    return AVATAR_PALETTE[i];
  }

  function getInitials(name, fallbackIndex) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return 'P' + fallbackIndex;
    }
    var clean = name.trim();

    var personMatch = clean.match(/^person\s*(\d+)$/i);
    if (personMatch) {
      return 'P' + personMatch[1];
    }

    var parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].length >= 2 ? parts[0].slice(0, 2).toUpperCase() : parts[0][0].toUpperCase();
    }

    var firstLetter = parts[0][0];
    var lastLetter = parts[parts.length - 1][0];
    return (firstLetter + lastLetter).toUpperCase();
  }

  // DOM Elements references
  var occasionInput, venueInput, occasionTypeSelect, occasionDateInput;
  var currencySelect, currencyPrefixDisplay, billInput, peopleInput;
  var modeEqualBtn, modeCustomBtn, peopleInputsContainer;
  var btnIncPeople, btnDecPeople, customDistributionTools, btnBalanceRemaining;
  var splitBtn, saveBillBtn, resetBtn;
  var alertBox, alertText, resultsSection, occasionDisplay, venueMetaDisplay;
  var summaryBill, summaryPeople, summarySplitType, summaryBaseShare;
  var seriesCountLabel, stackedAvatarsContainer, splittersSeriesContainer;
  var sharesListBody, totalSharesSum, verificationCard, verificationText, remainderExplanation;
  var downloadBillBtn, saveCurrentResultBtn, printBillBtn;
  var openSavedBtn, savedBillsBadge, savedBillsModal, closeSavedModalBtn, closeModalFooterBtn, savedBillsList, clearAllSavedBtn;
  var offlineIndicator, offlineText, installAppBtn;

  // State
  var currentSplitMode = 'equal';
  var participantsData = [];
  var lastCalculatedResult = null;
  var deferredInstallPrompt = null;

  function formatCurrency(amount, symbol) {
    var sym = symbol !== undefined && symbol !== null ? symbol : (currencySelect ? currencySelect.value : '$');
    var num = Number(amount) || 0;
    return sym + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function initializeDefaultDate() {
    if (occasionDateInput && !occasionDateInput.value) {
      var today = new Date();
      var yyyy = today.getFullYear();
      var mm = String(today.getMonth() + 1).padStart(2, '0');
      var dd = String(today.getDate()).padStart(2, '0');
      occasionDateInput.value = yyyy + '-' + mm + '-' + dd;
    }
  }

  // Point 4: Show a message, and NO result, if the bill or the number of people is empty, zero or negative
  function showError(message, type) {
    var alertType = type || 'error';
    if (!alertBox || !alertText) return;

    alertText.textContent = message;
    alertBox.className = 'alert-box alert-' + alertType;
    alertBox.classList.remove('hidden');

    if (alertType === 'error') {
      if (resultsSection) {
        resultsSection.classList.add('hidden');
      }
      lastCalculatedResult = null;
    }
  }

  function clearError() {
    if (!alertBox || !alertText) return;
    alertBox.classList.add('hidden');
    alertText.textContent = '';
  }

  function handleCurrencyChange() {
    if (!currencySelect || !currencyPrefixDisplay) return;
    var sym = currencySelect.value;
    currencyPrefixDisplay.textContent = sym;
    renderPeopleInputs();
    if (lastCalculatedResult && resultsSection && !resultsSection.classList.contains('hidden')) {
      handleCalculate(false);
    }
  }

  function syncParticipantsCount(count) {
    var targetCount = Math.max(1, Math.min(100, count));
    if (peopleInput) {
      peopleInput.value = targetCount;
    }

    var updated = [];
    for (var i = 0; i < targetCount; i++) {
      if (participantsData[i]) {
        updated.push(participantsData[i]);
      } else {
        updated.push({
          id: i + 1,
          name: '',
          customShare: ''
        });
      }
    }
    participantsData = updated;
    renderPeopleInputs();
  }

  function renderPeopleInputs() {
    if (!peopleInputsContainer) return;
    peopleInputsContainer.innerHTML = '';
    var currentSymbol = currencySelect ? currencySelect.value : '$';

    participantsData.forEach(function (person, index) {
      var card = document.createElement('div');
      card.className = 'person-input-card';

      var colors = getAvatarColors(index + 1);
      var initials = getInitials(person.name, index + 1);

      var topRow = document.createElement('div');
      topRow.className = 'person-card-top';

      var avatar = document.createElement('div');
      avatar.className = 'avatar-circle';
      avatar.style.backgroundColor = colors.bg;
      avatar.style.color = colors.text;
      avatar.style.borderColor = colors.border;
      avatar.textContent = initials;
      topRow.appendChild(avatar);

      var metaWrap = document.createElement('div');
      metaWrap.className = 'person-card-meta';

      var label = document.createElement('div');
      label.className = 'person-card-label';
      label.textContent = 'Participant ' + (index + 1);

      var namePreview = document.createElement('div');
      namePreview.className = 'person-card-name-preview';
      namePreview.textContent = person.name || ('Person ' + (index + 1));

      metaWrap.appendChild(label);
      metaWrap.appendChild(namePreview);
      topRow.appendChild(metaWrap);
      card.appendChild(topRow);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'e.g., Krushna Shimpi or Person ' + (index + 1);
      nameInput.value = person.name || '';
      nameInput.addEventListener('input', function (e) {
        person.name = e.target.value.trim();
        avatar.textContent = getInitials(person.name, index + 1);
        namePreview.textContent = person.name || ('Person ' + (index + 1));
        saveActiveState();
      });
      card.appendChild(nameInput);

      if (currentSplitMode === 'custom') {
        var customWrap = document.createElement('div');
        customWrap.className = 'custom-share-input-wrap';

        var customLabel = document.createElement('label');
        customLabel.textContent = 'Share Amount (' + currentSymbol + '):';
        customWrap.appendChild(customLabel);

        var customInputWrap = document.createElement('div');
        customInputWrap.className = 'input-wrapper';

        var prefixSpan = document.createElement('span');
        prefixSpan.className = 'currency-prefix';
        prefixSpan.textContent = currentSymbol;
        customInputWrap.appendChild(prefixSpan);

        var shareInput = document.createElement('input');
        shareInput.type = 'number';
        shareInput.className = 'has-prefix';
        shareInput.step = '0.01';
        shareInput.min = '0';
        shareInput.placeholder = '0.00';
        shareInput.value = person.customShare !== '' && person.customShare !== undefined ? person.customShare : '';
        shareInput.addEventListener('input', function (e) {
          person.customShare = e.target.value;
          saveActiveState();
        });
        customInputWrap.appendChild(shareInput);
        customWrap.appendChild(customInputWrap);

        card.appendChild(customWrap);
      }

      peopleInputsContainer.appendChild(card);
    });

    if (customDistributionTools) {
      if (currentSplitMode === 'custom') {
        customDistributionTools.classList.remove('hidden');
      } else {
        customDistributionTools.classList.add('hidden');
      }
    }
  }

  function distributeRemainingEvenly() {
    clearError();
    if (!billInput) return;
    var rawBill = billInput.value;
    var billVal = parseFloat(rawBill);

    if (isNaN(billVal) || billVal <= 0) {
      showError('Please enter a valid total bill amount before balancing shares.');
      return;
    }

    var totalCents = Math.round(billVal * 100);
    var assignedCents = 0;
    var unassignedIndices = [];

    participantsData.forEach(function (person, idx) {
      var rawVal = String(person.customShare || '').trim();
      if (rawVal !== '' && !isNaN(parseFloat(rawVal))) {
        assignedCents += Math.round(parseFloat(rawVal) * 100);
      } else {
        unassignedIndices.push(idx);
      }
    });

    var remainingCents = totalCents - assignedCents;

    if (unassignedIndices.length === 0) {
      showError('All participants already have specified shares. Clear some amounts to re-balance.');
      return;
    }

    if (remainingCents < 0) {
      showError('Specified shares (' + formatCurrency(assignedCents / 100) + ') exceed the total bill (' + formatCurrency(billVal) + '). Please adjust.');
      return;
    }

    var baseCentsPerPerson = Math.floor(remainingCents / unassignedIndices.length);
    var remainderCents = remainingCents % unassignedIndices.length;

    unassignedIndices.forEach(function (personIdx, i) {
      var shareCents = i < remainderCents ? baseCentsPerPerson + 1 : baseCentsPerPerson;
      participantsData[personIdx].customShare = (shareCents / 100).toFixed(2);
    });

    renderPeopleInputs();
    saveActiveState();
    showError('Remaining ' + formatCurrency(remainingCents / 100) + ' distributed across ' + unassignedIndices.length + ' participant(s).', 'success');
  }

  // Point 4: Comprehensive validation for empty, zero, or negative inputs
  function validateInputs() {
    if (!billInput || !peopleInput) {
      return { valid: false, message: 'Form inputs not found.' };
    }

    var billRaw = billInput.value;
    var peopleRaw = peopleInput.value;

    if (billRaw === null || billRaw === undefined || String(billRaw).trim() === '') {
      return { valid: false, message: 'Please enter a bill amount.' };
    }

    var billVal = parseFloat(billRaw);
    if (isNaN(billVal)) {
      return { valid: false, message: 'Please enter a valid numeric bill amount.' };
    }

    if (billVal <= 0) {
      return { valid: false, message: 'The bill amount must be greater than zero.' };
    }

    if (peopleRaw === null || peopleRaw === undefined || String(peopleRaw).trim() === '') {
      return { valid: false, message: 'Please enter the number of people.' };
    }

    var peopleVal = Number(peopleRaw);
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
      people: peopleVal
    };
  }

  // Point 3: Calculate each person's share, exact penny allocation, sum equals bill exactly
  function handleCalculate(triggerScroll) {
    clearError();

    var validation = validateInputs();
    if (!validation.valid) {
      // Point 4: Show message and NO result if empty, zero, or negative
      showError(validation.message, 'error');
      try {
        localStorage.removeItem(STORAGE_ACTIVE_KEY);
      } catch (e) {}
      return;
    }

    var bill = validation.bill;
    var people = validation.people;
    var currentSymbol = currencySelect ? currencySelect.value : '$';
    var occasion = (occasionInput && occasionInput.value.trim()) || 'Dinner & Gathering';
    var venue = (venueInput && venueInput.value.trim()) || 'Restaurant / Cafe';
    var occasionType = (occasionTypeSelect && occasionTypeSelect.value) || 'Dinner';
    var occasionDate = (occasionDateInput && occasionDateInput.value) || new Date().toISOString().split('T')[0];

    // Total in integer cents prevents floating point issues
    var totalCents = Math.round(bill * 100);
    var shares = [];
    var calculatedCentsSum = 0;
    var splitExplanation = '';

    if (currentSplitMode === 'equal') {
      // Standard Equal Split with exact penny remainder distribution
      var baseCents = Math.floor(totalCents / people);
      var remainderCents = totalCents % people;

      for (var i = 0; i < people; i++) {
        var personData = participantsData[i] || { name: 'Person ' + (i + 1) };
        var displayName = (personData.name && personData.name.trim()) ? personData.name.trim() : ('Person ' + (i + 1));
        var initials = getInitials(displayName, i + 1);
        var personCents = i < remainderCents ? baseCents + 1 : baseCents;

        shares.push({
          personIndex: i + 1,
          name: displayName,
          initials: initials,
          amount: personCents / 100,
          cents: personCents,
          statusNote: i < remainderCents ? 'Exact penny balance (+0.01)' : 'Standard equal share',
          isAdjusted: false
        });

        calculatedCentsSum += personCents;
      }

      if (remainderCents > 0) {
        var higher = formatCurrency((baseCents + 1) / 100, currentSymbol);
        var regular = formatCurrency(baseCents / 100, currentSymbol);
        splitExplanation = 'Exact Penny Balance: ' + remainderCents + ' ' +
          (remainderCents === 1 ? 'person pays ' : 'people pay ') + higher +
          ' and ' + (people - remainderCents) + ' ' +
          ((people - remainderCents) === 1 ? 'person pays ' : 'people pay ') + regular +
          '. Sum matches ' + formatCurrency(bill, currentSymbol) + ' exactly.';
      } else {
        splitExplanation = 'The bill splits evenly at ' + formatCurrency(baseCents / 100, currentSymbol) + ' per person.';
      }
    } else {
      // Custom / Adjusted split mode
      var allFilled = true;
      for (var j = 0; j < people; j++) {
        var pData = participantsData[j] || { name: 'Person ' + (j + 1), customShare: '' };
        var dName = (pData.name && pData.name.trim()) ? pData.name.trim() : ('Person ' + (j + 1));
        var pInitials = getInitials(dName, j + 1);
        var rawShare = String(pData.customShare || '').trim();

        if (rawShare === '' || isNaN(parseFloat(rawShare))) {
          allFilled = false;
          break;
        }

        var shareVal = parseFloat(rawShare);
        if (shareVal < 0) {
          showError('Share for ' + dName + ' cannot be negative.');
          return;
        }

        var shareCents = Math.round(shareVal * 100);
        calculatedCentsSum += shareCents;

        var avgShare = bill / people;
        var note = 'Custom share';
        if (shareVal < avgShare - 0.01) {
          note = 'Paying less than average';
        } else if (shareVal > avgShare + 0.01) {
          note = 'Paying more than average';
        } else {
          note = 'Average share';
        }

        shares.push({
          personIndex: j + 1,
          name: dName,
          initials: pInitials,
          amount: shareCents / 100,
          cents: shareCents,
          statusNote: note,
          isAdjusted: true
        });
      }

      if (!allFilled) {
        showError('Please enter a share amount for every participant, or click "Distribute Remaining Bill Evenly" to auto-balance.');
        return;
      }

      var differenceCents = calculatedCentsSum - totalCents;
      if (differenceCents !== 0) {
        var diffFormatted = formatCurrency(Math.abs(differenceCents) / 100, currentSymbol);
        if (differenceCents > 0) {
          showError('Total allocated shares (' + formatCurrency(calculatedCentsSum / 100, currentSymbol) + ') exceed total bill (' + formatCurrency(bill, currentSymbol) + ') by ' + diffFormatted + '. Please adjust.');
        } else {
          showError('Total allocated shares (' + formatCurrency(calculatedCentsSum / 100, currentSymbol) + ') are less than total bill (' + formatCurrency(bill, currentSymbol) + ') by ' + diffFormatted + '. Click "Distribute Remaining" to balance.');
        }
        return;
      }

      splitExplanation = 'Custom Split: Individual shares add up exactly to ' + formatCurrency(bill, currentSymbol) + '.';
    }

    // Populate Results UI Elements
    if (occasionDisplay) occasionDisplay.textContent = occasion;
    if (venueMetaDisplay) venueMetaDisplay.textContent = venue + ' \u2022 ' + occasionType + ' \u2022 ' + occasionDate;

    if (summaryBill) summaryBill.textContent = formatCurrency(bill, currentSymbol);
    if (summaryPeople) summaryPeople.textContent = people + ' ' + (people === 1 ? 'person' : 'people');
    if (summarySplitType) summarySplitType.textContent = currentSplitMode === 'equal' ? 'Equal Split' : 'Custom Shares';
    if (summaryBaseShare) summaryBaseShare.textContent = formatCurrency(bill / people, currentSymbol);

    // Overlapping avatar circles series
    if (seriesCountLabel) seriesCountLabel.textContent = shares.length + ' Splitters';
    if (stackedAvatarsContainer) stackedAvatarsContainer.innerHTML = '';
    if (splittersSeriesContainer) splittersSeriesContainer.innerHTML = '';

    shares.forEach(function (share, index) {
      var colors = getAvatarColors(share.personIndex);

      if (stackedAvatarsContainer) {
        var stackedCircle = document.createElement('div');
        stackedCircle.className = 'stacked-avatar-item';
        stackedCircle.style.backgroundColor = colors.bg;
        stackedCircle.style.color = colors.text;
        stackedCircle.style.borderColor = colors.border;
        stackedCircle.style.zIndex = index + 1;
        stackedCircle.textContent = share.initials;
        stackedCircle.title = share.name + ': ' + formatCurrency(share.amount, currentSymbol) + ' (' + share.statusNote + ')';
        stackedAvatarsContainer.appendChild(stackedCircle);
      }

      if (splittersSeriesContainer) {
        var chip = document.createElement('div');
        chip.className = 'splitter-series-chip';

        var chipAvatar = document.createElement('div');
        chipAvatar.className = 'avatar-circle-sm';
        chipAvatar.style.backgroundColor = colors.bg;
        chipAvatar.style.color = colors.text;
        chipAvatar.style.borderColor = colors.border;
        chipAvatar.textContent = share.initials;

        var chipInfo = document.createElement('div');
        chipInfo.className = 'splitter-chip-info';

        var chipName = document.createElement('span');
        chipName.className = 'splitter-chip-name';
        chipName.textContent = share.name;

        var chipAmount = document.createElement('span');
        chipAmount.className = 'splitter-chip-amount';
        chipAmount.textContent = formatCurrency(share.amount, currentSymbol);

        chipInfo.appendChild(chipName);
        chipInfo.appendChild(chipAmount);

        chip.appendChild(chipAvatar);
        chip.appendChild(chipInfo);
        splittersSeriesContainer.appendChild(chip);
      }
    });

    // Populate Shares Table
    if (sharesListBody) {
      sharesListBody.innerHTML = '';
      shares.forEach(function (share) {
        var colors = getAvatarColors(share.personIndex);
        var tr = document.createElement('tr');

        var tdName = document.createElement('td');
        tdName.className = 'person-name-cell';

        var cellWrap = document.createElement('div');
        cellWrap.className = 'person-cell-wrap';

        var avatarSm = document.createElement('div');
        avatarSm.className = 'avatar-circle-sm';
        avatarSm.style.backgroundColor = colors.bg;
        avatarSm.style.color = colors.text;
        avatarSm.style.borderColor = colors.border;
        avatarSm.textContent = share.initials;

        var nameSpan = document.createElement('span');
        nameSpan.textContent = share.name;

        cellWrap.appendChild(avatarSm);
        cellWrap.appendChild(nameSpan);
        tdName.appendChild(cellWrap);

        var tdNote = document.createElement('td');
        tdNote.className = 'person-note-cell';
        tdNote.textContent = share.statusNote;

        var tdAmount = document.createElement('td');
        tdAmount.className = 'person-share-amount text-right';
        tdAmount.textContent = formatCurrency(share.amount, currentSymbol);

        tr.appendChild(tdName);
        tr.appendChild(tdNote);
        tr.appendChild(tdAmount);
        sharesListBody.appendChild(tr);
      });
    }

    var totalCollected = calculatedCentsSum / 100;
    if (totalSharesSum) totalSharesSum.textContent = formatCurrency(totalCollected, currentSymbol);

    if (verificationCard) verificationCard.className = 'exact-verification';
    if (verificationText) verificationText.textContent = '\u2713 Verification: Shares (' + formatCurrency(totalCollected, currentSymbol) + ') add up exactly to the bill.';
    if (remainderExplanation) remainderExplanation.textContent = splitExplanation;

    if (resultsSection) resultsSection.classList.remove('hidden');

    lastCalculatedResult = {
      occasion: occasion,
      venue: venue,
      occasionType: occasionType,
      occasionDate: occasionDate,
      currency: currentSymbol,
      totalBill: bill,
      partySize: people,
      splitMode: currentSplitMode,
      shares: shares,
      totalCollected: totalCollected,
      timestamp: new Date().toISOString()
    };

    // Point 5: Save state to ensure persistence on reload
    saveActiveState();

    if (triggerScroll && resultsSection) {
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function saveBillToHistory() {
    if (!lastCalculatedResult) {
      handleCalculate(false);
      if (!lastCalculatedResult) return;
    }

    try {
      var history = getSavedBillsHistory();
      var billToSave = Object.assign({ id: 'bill_' + Date.now() }, lastCalculatedResult);

      history.unshift(billToSave);
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
      updateSavedBillsBadge();
      showError('"' + billToSave.occasion + '" saved to your Bills Buddy history!', 'success');
    } catch (e) {
      showError('Could not save bill to local storage.');
    }
  }

  function getSavedBillsHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function updateSavedBillsBadge() {
    var history = getSavedBillsHistory();
    if (savedBillsBadge) {
      savedBillsBadge.textContent = history.length;
    }
  }

  function openSavedBillsModal() {
    var history = getSavedBillsHistory();
    if (!savedBillsList) return;
    savedBillsList.innerHTML = '';

    if (history.length === 0) {
      savedBillsList.innerHTML = '<div class="empty-saved-message">No saved bills yet. Calculate a split and click "Save Bill" to keep a history here!</div>';
    } else {
      history.forEach(function (bill) {
        var card = document.createElement('div');
        card.className = 'saved-bill-card';

        var topRow = document.createElement('div');
        topRow.className = 'saved-bill-top';
        topRow.innerHTML = '<span class="saved-bill-title">' + (bill.occasion || 'Gathering') + '</span>' +
          '<span class="saved-bill-total">' + formatCurrency(bill.totalBill, bill.currency) + '</span>';
        card.appendChild(topRow);

        var meta = document.createElement('div');
        meta.className = 'saved-bill-meta';
        meta.textContent = (bill.venue || 'Hotel/Cafe') + ' \u2022 ' + (bill.occasionType || 'Gathering') + ' \u2022 ' + (bill.occasionDate || 'No date') + ' \u2022 ' + bill.partySize + ' People';
        card.appendChild(meta);

        if (Array.isArray(bill.shares) && bill.shares.length > 0) {
          var stackedWrap = document.createElement('div');
          stackedWrap.className = 'saved-bill-stacked-avatars';

          bill.shares.forEach(function (s, idx) {
            var colors = getAvatarColors(s.personIndex || idx + 1);
            var circle = document.createElement('div');
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
            circle.title = s.name + ': ' + formatCurrency(s.amount, bill.currency);
            stackedWrap.appendChild(circle);
          });

          card.appendChild(stackedWrap);
        }

        var sharesContainer = document.createElement('div');
        sharesContainer.className = 'saved-bill-shares';
        bill.shares.forEach(function (s, idx) {
          var colors = getAvatarColors(s.personIndex || idx + 1);
          var initials = s.initials || getInitials(s.name, idx + 1);

          var row = document.createElement('div');
          row.className = 'saved-bill-share-row';

          var userWrap = document.createElement('div');
          userWrap.className = 'saved-bill-user-wrap';

          var avatarSm = document.createElement('div');
          avatarSm.className = 'avatar-circle-sm';
          avatarSm.style.backgroundColor = colors.bg;
          avatarSm.style.color = colors.text;
          avatarSm.style.borderColor = colors.border;
          avatarSm.textContent = initials;

          var nameSpan = document.createElement('span');
          nameSpan.innerHTML = s.name + ' <small style="color: var(--text-muted);">(' + s.statusNote + ')</small>';

          userWrap.appendChild(avatarSm);
          userWrap.appendChild(nameSpan);

          var amtSpan = document.createElement('strong');
          amtSpan.style.color = 'var(--blue-primary)';
          amtSpan.textContent = formatCurrency(s.amount, bill.currency);

          row.appendChild(userWrap);
          row.appendChild(amtSpan);
          sharesContainer.appendChild(row);
        });
        card.appendChild(sharesContainer);

        var actions = document.createElement('div');
        actions.className = 'saved-bill-actions';

        var loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.className = 'btn-primary';
        loadBtn.textContent = 'Load into Form';
        loadBtn.addEventListener('click', function () {
          loadSavedBill(bill);
          closeSavedBillsModal();
        });
        actions.appendChild(loadBtn);

        var downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'btn-secondary';
        downloadBtn.textContent = 'Download Receipt';
        downloadBtn.addEventListener('click', function () {
          downloadReceiptFile(bill);
        });
        actions.appendChild(downloadBtn);

        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-secondary';
        deleteBtn.style.color = 'var(--error-text)';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', function () {
          deleteSavedBill(bill.id);
        });
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        savedBillsList.appendChild(card);
      });
    }

    if (savedBillsModal) savedBillsModal.classList.remove('hidden');
  }

  function closeSavedBillsModal() {
    if (savedBillsModal) savedBillsModal.classList.add('hidden');
  }

  function loadSavedBill(bill) {
    if (!bill) return;
    if (occasionInput) occasionInput.value = bill.occasion || '';
    if (venueInput) venueInput.value = bill.venue || '';
    if (occasionTypeSelect) occasionTypeSelect.value = bill.occasionType || 'Dinner';
    if (occasionDateInput) occasionDateInput.value = bill.occasionDate || '';
    if (currencySelect) currencySelect.value = bill.currency || '$';
    if (currencyPrefixDisplay) currencyPrefixDisplay.textContent = bill.currency || '$';
    if (billInput) billInput.value = bill.totalBill || '';
    if (peopleInput) peopleInput.value = bill.partySize || (bill.shares ? bill.shares.length : 3);

    currentSplitMode = bill.splitMode || 'equal';
    if (currentSplitMode === 'equal') {
      if (modeEqualBtn) { modeEqualBtn.classList.add('active'); modeEqualBtn.setAttribute('aria-selected', 'true'); }
      if (modeCustomBtn) { modeCustomBtn.classList.remove('active'); modeCustomBtn.setAttribute('aria-selected', 'false'); }
    } else {
      if (modeCustomBtn) { modeCustomBtn.classList.add('active'); modeCustomBtn.setAttribute('aria-selected', 'true'); }
      if (modeEqualBtn) { modeEqualBtn.classList.remove('active'); modeEqualBtn.setAttribute('aria-selected', 'false'); }
    }

    if (Array.isArray(bill.shares)) {
      participantsData = bill.shares.map(function (s, idx) {
        return {
          id: idx + 1,
          name: s.name,
          customShare: s.amount !== undefined ? String(s.amount) : ''
        };
      });
    }

    renderPeopleInputs();
    handleCalculate(true);
    showError('Loaded "' + (bill.occasion || 'bill') + '" from history.', 'success');
  }

  function deleteSavedBill(id) {
    var history = getSavedBillsHistory().filter(function (b) { return b.id !== id; });
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {}
    updateSavedBillsBadge();
    openSavedBillsModal();
  }

  function clearAllSavedBills() {
    if (confirm('Are you sure you want to delete all saved bills?')) {
      try {
        localStorage.removeItem(STORAGE_HISTORY_KEY);
      } catch (e) {}
      updateSavedBillsBadge();
      openSavedBillsModal();
    }
  }

  function downloadReceiptFile(billData) {
    var bill = billData || lastCalculatedResult;
    if (!bill) {
      handleCalculate(false);
      bill = lastCalculatedResult;
      if (!bill) return;
    }

    var sym = bill.currency || '$';
    var receiptText = '';
    receiptText += '===================================================\n';
    receiptText += '               BILLS BUDDY RECEIPT                 \n';
    receiptText += '===================================================\n';
    receiptText += 'Occasion:      ' + (bill.occasion || 'Gathering') + '\n';
    receiptText += 'Venue/Hotel:   ' + (bill.venue || 'Restaurant') + '\n';
    receiptText += 'Category:      ' + (bill.occasionType || 'Dinner') + '\n';
    receiptText += 'Date:          ' + (bill.occasionDate || 'N/A') + '\n';
    receiptText += 'Split Mode:    ' + (bill.splitMode === 'equal' ? 'Equal Split (Exact)' : 'Custom Shares') + '\n';
    receiptText += '---------------------------------------------------\n';
    receiptText += 'Total Bill:    ' + formatCurrency(bill.totalBill, sym) + '\n';
    receiptText += 'Party Size:    ' + bill.partySize + ' Participants\n';
    receiptText += '---------------------------------------------------\n';
    receiptText += 'INDIVIDUAL PAYMENT SHARES:\n';

    if (Array.isArray(bill.shares)) {
      bill.shares.forEach(function (share, idx) {
        var padName = (share.name + '                        ').slice(0, 24);
        var padAmt = formatCurrency(share.amount, sym);
        receiptText += '  ' + (idx + 1) + '. ' + padName + ' : ' + padAmt + ' [' + share.statusNote + ']\n';
      });
    }

    receiptText += '---------------------------------------------------\n';
    receiptText += 'TOTAL COLLECTED: ' + formatCurrency(bill.totalCollected, sym) + '\n';
    receiptText += 'VERIFICATION:    EXACT MATCH (Zero discrepancies)\n';
    receiptText += '===================================================\n';
    receiptText += 'Generated by Bills Buddy - Offline Web App\n';

    try {
      var blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var safeName = (bill.occasion || 'bill').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.href = url;
      a.download = 'bills_buddy_' + safeName + '_' + (bill.occasionDate || 'date') + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      showError('Unable to generate download file.');
    }
  }

  // Point 5: Store active calculation state to ensure persistence on page reload
  function saveActiveState() {
    try {
      var isVisible = resultsSection && !resultsSection.classList.contains('hidden');
      var state = {
        occasion: occasionInput ? occasionInput.value : '',
        venue: venueInput ? venueInput.value : '',
        occasionType: occasionTypeSelect ? occasionTypeSelect.value : 'Dinner',
        occasionDate: occasionDateInput ? occasionDateInput.value : '',
        currency: currencySelect ? currencySelect.value : '$',
        bill: billInput ? billInput.value : '',
        people: peopleInput ? peopleInput.value : '3',
        splitMode: currentSplitMode,
        participants: participantsData,
        hasCalculated: isVisible
      };
      localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // Point 5: Restore result and inputs after the page is reloaded
  function restoreActiveState() {
    try {
      var raw = localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (!raw) {
        initializeDefaultDate();
        syncParticipantsCount(3);
        updateSavedBillsBadge();
        return;
      }

      var state = JSON.parse(raw);
      if (state) {
        if (occasionInput) occasionInput.value = state.occasion || '';
        if (venueInput) venueInput.value = state.venue || '';
        if (occasionTypeSelect) occasionTypeSelect.value = state.occasionType || 'Dinner';
        if (occasionDateInput) occasionDateInput.value = state.occasionDate || '';
        if (currencySelect) currencySelect.value = state.currency || '$';
        if (currencyPrefixDisplay) currencyPrefixDisplay.textContent = state.currency || '$';
        if (billInput) billInput.value = state.bill || '';

        var count = parseInt(state.people, 10) || 3;
        if (peopleInput) peopleInput.value = count;

        if (state.splitMode === 'custom') {
          currentSplitMode = 'custom';
          if (modeCustomBtn) { modeCustomBtn.classList.add('active'); modeCustomBtn.setAttribute('aria-selected', 'true'); }
          if (modeEqualBtn) { modeEqualBtn.classList.remove('active'); modeEqualBtn.setAttribute('aria-selected', 'false'); }
        } else {
          currentSplitMode = 'equal';
          if (modeEqualBtn) { modeEqualBtn.classList.add('active'); modeEqualBtn.setAttribute('aria-selected', 'true'); }
          if (modeCustomBtn) { modeCustomBtn.classList.remove('active'); modeCustomBtn.setAttribute('aria-selected', 'false'); }
        }

        if (Array.isArray(state.participants) && state.participants.length > 0) {
          participantsData = state.participants;
          renderPeopleInputs();
        } else {
          syncParticipantsCount(count);
        }

        // Point 5: If the bill was calculated, automatically recalculate and display result after reload!
        if (state.hasCalculated && state.bill && count > 0) {
          handleCalculate(false);
        }
      }
    } catch (e) {
      initializeDefaultDate();
      syncParticipantsCount(3);
    }
    updateSavedBillsBadge();
  }

  function handleReset() {
    if (occasionInput) occasionInput.value = '';
    if (venueInput) venueInput.value = '';
    if (occasionTypeSelect) occasionTypeSelect.value = 'Dinner';
    initializeDefaultDate();
    if (currencySelect) currencySelect.value = '$';
    if (currencyPrefixDisplay) currencyPrefixDisplay.textContent = '$';
    if (billInput) billInput.value = '';
    if (peopleInput) peopleInput.value = '3';

    currentSplitMode = 'equal';
    if (modeEqualBtn) { modeEqualBtn.classList.add('active'); modeEqualBtn.setAttribute('aria-selected', 'true'); }
    if (modeCustomBtn) { modeCustomBtn.classList.remove('active'); modeCustomBtn.setAttribute('aria-selected', 'false'); }

    clearError();
    if (resultsSection) resultsSection.classList.add('hidden');
    lastCalculatedResult = null;

    syncParticipantsCount(3);
    try {
      localStorage.removeItem(STORAGE_ACTIVE_KEY);
    } catch (e) {}

    if (occasionInput) occasionInput.focus();
  }

  function initOfflineCapabilities() {
    function updateOnlineStatus() {
      if (!offlineIndicator || !offlineText) return;
      var dot = offlineIndicator.querySelector('.status-dot');
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        offlineIndicator.title = 'All features work offline without an internet connection.';
        offlineText.textContent = 'Offline Ready';
        if (dot) dot.style.backgroundColor = '#22c55e';
      } else {
        offlineIndicator.title = 'You are currently offline. Bills Buddy works seamlessly offline!';
        offlineText.textContent = 'Offline Mode';
        if (dot) dot.style.backgroundColor = '#f59e0b';
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      updateOnlineStatus();

      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (installAppBtn) {
          installAppBtn.classList.remove('hidden');
        }
      });

      if (installAppBtn) {
        installAppBtn.addEventListener('click', function () {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          deferredInstallPrompt.userChoice.then(function (choiceResult) {
            if (choiceResult && choiceResult.outcome === 'accepted') {
              installAppBtn.classList.add('hidden');
            }
            deferredInstallPrompt = null;
          }).catch(function () {});
        });
      }

      window.addEventListener('appinstalled', function () {
        if (installAppBtn) {
          installAppBtn.classList.add('hidden');
        }
      });
    }
  }

  // Safe DOM Initialization
  function init() {
    occasionInput = document.getElementById('occasion');
    venueInput = document.getElementById('venue-name');
    occasionTypeSelect = document.getElementById('occasion-type');
    occasionDateInput = document.getElementById('occasion-date');
    currencySelect = document.getElementById('currency-select');
    currencyPrefixDisplay = document.getElementById('currency-symbol-display');
    billInput = document.getElementById('bill-amount');
    peopleInput = document.getElementById('num-people');

    modeEqualBtn = document.getElementById('mode-equal-btn');
    modeCustomBtn = document.getElementById('mode-custom-btn');
    peopleInputsContainer = document.getElementById('people-inputs-container');
    btnIncPeople = document.getElementById('btn-inc-people');
    btnDecPeople = document.getElementById('btn-dec-people');
    customDistributionTools = document.getElementById('custom-distribution-tools');
    btnBalanceRemaining = document.getElementById('btn-balance-remaining');

    splitBtn = document.getElementById('split-btn');
    saveBillBtn = document.getElementById('save-bill-btn');
    resetBtn = document.getElementById('reset-btn');

    alertBox = document.getElementById('alert-box');
    alertText = document.getElementById('alert-text');

    resultsSection = document.getElementById('results-section');
    occasionDisplay = document.getElementById('occasion-display');
    venueMetaDisplay = document.getElementById('venue-meta-display');
    summaryBill = document.getElementById('summary-bill');
    summaryPeople = document.getElementById('summary-people');
    summarySplitType = document.getElementById('summary-split-type');
    summaryBaseShare = document.getElementById('summary-base-share');

    seriesCountLabel = document.getElementById('series-count-label');
    stackedAvatarsContainer = document.getElementById('stacked-avatars-container');
    splittersSeriesContainer = document.getElementById('splitters-series-container');

    sharesListBody = document.getElementById('shares-list-body');
    totalSharesSum = document.getElementById('total-shares-sum');
    verificationCard = document.getElementById('verification-card');
    verificationText = document.getElementById('verification-text');
    remainderExplanation = document.getElementById('remainder-explanation');

    downloadBillBtn = document.getElementById('download-bill-btn');
    saveCurrentResultBtn = document.getElementById('save-current-result-btn');
    printBillBtn = document.getElementById('print-bill-btn');

    openSavedBtn = document.getElementById('open-saved-btn');
    savedBillsBadge = document.getElementById('saved-bills-badge');
    savedBillsModal = document.getElementById('saved-bills-modal');
    closeSavedModalBtn = document.getElementById('close-saved-modal-btn');
    closeModalFooterBtn = document.getElementById('close-modal-footer-btn');
    savedBillsList = document.getElementById('saved-bills-list');
    clearAllSavedBtn = document.getElementById('clear-all-saved-btn');

    offlineIndicator = document.getElementById('offline-indicator');
    offlineText = document.getElementById('offline-text');
    installAppBtn = document.getElementById('install-app-btn');

    // Attach Event Listeners safely
    if (splitBtn) splitBtn.addEventListener('click', function () { handleCalculate(true); });
    if (saveBillBtn) saveBillBtn.addEventListener('click', saveBillToHistory);
    if (saveCurrentResultBtn) saveCurrentResultBtn.addEventListener('click', saveBillToHistory);
    if (resetBtn) resetBtn.addEventListener('click', handleReset);

    if (downloadBillBtn) downloadBillBtn.addEventListener('click', function () { downloadReceiptFile(null); });
    if (printBillBtn) printBillBtn.addEventListener('click', function () { window.print(); });

    if (openSavedBtn) openSavedBtn.addEventListener('click', openSavedBillsModal);
    if (closeSavedModalBtn) closeSavedModalBtn.addEventListener('click', closeSavedBillsModal);
    if (closeModalFooterBtn) closeModalFooterBtn.addEventListener('click', closeSavedBillsModal);
    if (clearAllSavedBtn) clearAllSavedBtn.addEventListener('click', clearAllSavedBills);

    if (modeEqualBtn) {
      modeEqualBtn.addEventListener('click', function () {
        if (currentSplitMode !== 'equal') {
          currentSplitMode = 'equal';
          modeEqualBtn.classList.add('active');
          modeEqualBtn.setAttribute('aria-selected', 'true');
          if (modeCustomBtn) {
            modeCustomBtn.classList.remove('active');
            modeCustomBtn.setAttribute('aria-selected', 'false');
          }
          renderPeopleInputs();
          saveActiveState();
          if (resultsSection && !resultsSection.classList.contains('hidden')) {
            handleCalculate(false);
          }
        }
      });
    }

    if (modeCustomBtn) {
      modeCustomBtn.addEventListener('click', function () {
        if (currentSplitMode !== 'custom') {
          currentSplitMode = 'custom';
          modeCustomBtn.classList.add('active');
          modeCustomBtn.setAttribute('aria-selected', 'true');
          if (modeEqualBtn) {
            modeEqualBtn.classList.remove('active');
            modeEqualBtn.setAttribute('aria-selected', 'false');
          }
          renderPeopleInputs();
          saveActiveState();
        }
      });
    }

    if (peopleInput) {
      peopleInput.addEventListener('input', function (e) {
        var count = parseInt(e.target.value, 10);
        if (!isNaN(count) && count >= 1 && count <= 100) {
          syncParticipantsCount(count);
          saveActiveState();
        }
      });
    }

    if (btnIncPeople) {
      btnIncPeople.addEventListener('click', function () {
        var current = parseInt(peopleInput.value, 10) || 1;
        if (current < 100) {
          syncParticipantsCount(current + 1);
          saveActiveState();
        }
      });
    }

    if (btnDecPeople) {
      btnDecPeople.addEventListener('click', function () {
        var current = parseInt(peopleInput.value, 10) || 1;
        if (current > 1) {
          syncParticipantsCount(current - 1);
          saveActiveState();
        }
      });
    }

    if (btnBalanceRemaining) {
      btnBalanceRemaining.addEventListener('click', distributeRemainingEvenly);
    }

    if (currencySelect) {
      currencySelect.addEventListener('change', function () {
        handleCurrencyChange();
        saveActiveState();
      });
    }

    [occasionInput, venueInput, occasionTypeSelect, occasionDateInput, billInput].forEach(function (input) {
      if (input) {
        input.addEventListener('input', saveActiveState);
      }
    });

    [occasionInput, venueInput, billInput, peopleInput].forEach(function (input) {
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleCalculate(true);
          }
        });
      }
    });

    if (savedBillsModal) {
      savedBillsModal.addEventListener('click', function (e) {
        if (e.target === savedBillsModal) {
          closeSavedBillsModal();
        }
      });
    }

    // Restore saved state and initialize UI
    restoreActiveState();
    initOfflineCapabilities();
  }

  // Self-executing initialization for any browser environment
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Also expose globally for direct integration if needed
  if (typeof window !== 'undefined') {
    window.BillsBuddy = {
      calculate: handleCalculate,
      reset: handleReset,
      init: init
    };
  }
})();
