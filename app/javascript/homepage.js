import {
  recordDay,
  previousPuzzles,
  previousRooms,
  lastSeries,
  lastRoom,
  lastDay,
} from './lib/history_storage';

var seriesSelect = document.getElementById('goto-series');
var sizeFilter = document.getElementById('size-filter');
var dayFilter = document.getElementById('day-filter');

function selectedOption() {
  return seriesSelect.options[seriesSelect.selectedIndex];
}

// A grouped dropdown entry (Nonograms) stands for a family of series and the
// size radio says which member is meant; every other entry stands for itself.
function seriesElement() {
  var option = selectedOption();
  if (!option) return null;
  if (!option.getAttribute('data-group')) return option;
  return sizeFilter ? sizeFilter.querySelector('input[name="size"]:checked') : null;
}

function seriesName() {
  var el = seriesElement();
  return el ? el.value : '';
}

function seriesDisplayName() {
  var el = seriesElement();
  if (!el) return seriesName();
  return el.getAttribute('data-display-name') || el.textContent.trim() || el.value;
}

function seriesAttribute(name) {
  var el = seriesElement();
  return el ? el.getAttribute('data-' + name) : null;
}

function updatePuzzlePlaceholder() {
  updateSizeFilter();
  document.getElementById('goto-number').placeholder = seriesAttribute('first-puzzle') + ' onwards';
  updateDayFilter();
}

function updateSizeFilter() {
  if (!sizeFilter) return;
  var option = selectedOption();
  var group = (option && option.getAttribute('data-group')) || '';

  sizeFilter.hidden = group === '';

  sizeFilter.querySelectorAll('label[data-group]').forEach(function (label) {
    label.hidden = label.getAttribute('data-group') !== group;
  });

  if (sizeFilter.hidden) return;

  // Leaving a radio from another group checked would name a series the player
  // can no longer see, so fall back to the first size of this one.
  var checked = sizeFilter.querySelector('input[name="size"]:checked');
  var checkedLabel = checked ? checked.closest('label[data-group]') : null;
  if (!checkedLabel || checkedLabel.hidden) {
    var first = sizeFilter.querySelector('label[data-group="' + group + '"] input');
    if (first) first.checked = true;
  }
}

function updateDayFilter() {
  var daysAttr = seriesAttribute('days');
  var supportedDays = (daysAttr || '').split(',').filter(function (d) { return d !== ''; });

  dayFilter.hidden = supportedDays.length === 0;

  // Show/hide each day label according to series support
  dayFilter.querySelectorAll('label[data-day]').forEach(function (label) {
    var d = label.getAttribute('data-day');
    label.hidden = supportedDays.indexOf(d) === -1;
  });

  if (dayFilter.hidden) {
    dayFilter.querySelector('input[value=""]').checked = true;
    return;
  }

  // Restore the previously chosen day if it's still valid for this series,
  // otherwise reset to "Any".
  var savedDay = lastDay();
  var savedRadio = savedDay !== null
    ? dayFilter.querySelector('input[name="day"][value="' + savedDay + '"]')
    : null;
  var savedLabel = savedRadio ? savedRadio.closest('label[data-day]') : null;
  if (savedRadio && (!savedLabel || !savedLabel.hidden)) {
    savedRadio.checked = true;
  } else {
    dayFilter.querySelector('input[value=""]').checked = true;
  }
}

dayFilter.addEventListener('change', function() {
  var checked = document.querySelector('input[name="day"]:checked');
  recordDay(checked ? checked.value : '');
});

updatePuzzlePlaceholder();

var links = Array.from(document.querySelectorAll('.crossword-link a'));
var originalHrefs = links.map(function(a) { return a.href; });

function makeHistory(inputId, listId, getItems) {
  var input = document.getElementById(inputId);
  var list  = document.getElementById(listId);
  var items = [];

  function refresh() { items = getItems(); }
  function show(filtered) {
    list.innerHTML = '';
    filtered.forEach(function(val) {
      var div = document.createElement('div');
      div.textContent = val;
      div.addEventListener('mousedown', function(e) {
        e.preventDefault();
        input.value = val;
        list.hidden = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      list.appendChild(div);
    });
    list.hidden = filtered.length === 0;
  }

  input.addEventListener('focus', function() {
    refresh();
    show(items);
  });
  input.addEventListener('input', function() {
    var q = input.value.toLowerCase();
    show(q ? items.filter(function(v) { return String(v).toLowerCase().includes(q); }) : items);
  });
  input.addEventListener('blur', function() { list.hidden = true; });

  return { refresh: refresh };
}

var puzzleAC = makeHistory('goto-number', 'puzzle-suggestions', function() {
  return previousPuzzles(seriesName());
});

makeHistory('goto-room', 'room-suggestions', previousRooms);

function populatePuzzleDatalist() { puzzleAC.refresh(); }
function lastPuzzleForSeries(series) {
  return previousPuzzles(series)[0] || '';
}

function onSeriesChange() {
  updatePuzzlePlaceholder();
  populatePuzzleDatalist();
  document.getElementById('goto-number').value = lastPuzzleForSeries(seriesName());
}
seriesSelect.addEventListener('change', onSeriesChange);
if (sizeFilter) sizeFilter.addEventListener('change', onSeriesChange);

function rewriteLinks() {
  var room = document.getElementById('goto-room').value.trim();
  links.forEach(function(a, i) {
    a.href = room ? originalHrefs[i] + '/' + encodeURIComponent(room) : originalHrefs[i];
  });
}
document.getElementById('goto-room').addEventListener('input', rewriteLinks);

// A saved series may be a member of a group, in which case the dropdown shows
// the group and the size radio carries the name.
function selectSavedSeries(savedSeries) {
  for (var i = 0; i < seriesSelect.options.length; i++) {
    if (seriesSelect.options[i].value === savedSeries) {
      seriesSelect.selectedIndex = i;
      return true;
    }
  }
  var radio = sizeFilter
    ? sizeFilter.querySelector('input[name="size"][value="' + savedSeries + '"]')
    : null;
  if (!radio) return false;
  var group = radio.closest('label[data-group]').getAttribute('data-group');
  for (var j = 0; j < seriesSelect.options.length; j++) {
    if (seriesSelect.options[j].getAttribute('data-group') === group) {
      seriesSelect.selectedIndex = j;
      radio.checked = true;
      return true;
    }
  }
  return false;
}

function initFromStorage() {
  var savedRoom   = lastRoom();
  var savedSeries = lastSeries();

  if (savedRoom) document.getElementById('goto-room').value = savedRoom;
  if (savedSeries && selectSavedSeries(savedSeries)) {
    updatePuzzlePlaceholder();
  }
  document.getElementById('goto-number').value = lastPuzzleForSeries(seriesName());

  // room autocomplete items are loaded on focus via getItems callback
  populatePuzzleDatalist();
  rewriteLinks();
}
window.addEventListener('pageshow', initFromStorage);

var form = document.getElementById('goto-form');
form.addEventListener('submit', function(e) {
  e.preventDefault();
  goToPuzzle(this);
});

document.getElementById('random-btn').addEventListener('click', function() {
  goToRandomPuzzle(this.form);
});

function goToPuzzle(form) {
  var series = seriesName();
  var number = form.number.value.trim();
  var room = form.room.value.trim();
  var errorEl = document.getElementById('goto-error');
  var displayName = seriesDisplayName();

  // Which puzzle is the most recent is the server's to know, so an empty
  // number is handed straight to it.
  if (!number) return goToLatestPuzzle(form);

  var firstPuzzleStr = seriesAttribute('first-puzzle');
  var lastPuzzleStr = seriesAttribute('last-puzzle');
  var firstPuzzle = parseInt(firstPuzzleStr, 10);
  var lastPuzzle = parseInt(lastPuzzleStr, 10);
  var num = parseInt(number, 10);
  if (isNaN(num) || num < firstPuzzle) {
    errorEl.textContent = displayName + ' puzzles start at No\u00A0' + firstPuzzleStr;
    return false;
  }
  if (!isNaN(lastPuzzle) && num > lastPuzzle) {
    errorEl.textContent = displayName + ' puzzles only go up to No\u00A0' + lastPuzzleStr;
    return false;
  }

  errorEl.textContent = '';
  var pathPrefix = form.dataset.pathPrefix || '';
  var url = pathPrefix + '/' + encodeURIComponent(series) + '/' + encodeURIComponent(number);
  if (room) url += '/' + encodeURIComponent(room);
  window.location = url;
  return false;
}

function goToLatestPuzzle(form) {
  document.getElementById('goto-error').textContent = '';
  window.location = shortcutUrl(form, 'latest');
  return false;
}

function goToRandomPuzzle(form) {
  var errorEl = document.getElementById('goto-error');

  if (!seriesAttribute('last-puzzle')) {
    errorEl.textContent = 'No puzzles available for ' + seriesDisplayName();
    return false;
  }

  errorEl.textContent = '';
  var url = shortcutUrl(form, 'random');
  var dayInput = form.querySelector('input[name="day"]:checked');
  if (dayInput && dayInput.value) {
    url += '?day=' + dayInput.value;
  }
  window.location = url;
  return false;
}

function shortcutUrl(form, shortcut) {
  var room = form.room.value.trim();
  var url = (form.dataset.pathPrefix || '') + '/' + encodeURIComponent(seriesName()) + '/' + shortcut;
  return room ? url + '/' + encodeURIComponent(room) : url;
}

var ERROR_MESSAGES = {
  random_failed: "Couldn't find a random puzzle — please try again.",
  latest_failed: "Couldn't find the most recent puzzle — try entering a number.",
};

var errorParams = new URLSearchParams(window.location.search);
var errorMessage = ERROR_MESSAGES[errorParams.get('error')];
if (errorMessage) {
  document.getElementById('goto-error').textContent = errorMessage;
  history.replaceState(null, '', window.location.pathname);
}
