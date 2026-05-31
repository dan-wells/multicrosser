import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';

const HTML_FIXTURE = `
  <form id="goto-form" data-path-prefix="">
    <select id="goto-series" name="series">
      <option value="cryptic" data-first-puzzle="21620" data-latest-puzzle="21700">Cryptic</option>
      <option value="quiptic" data-first-puzzle="1" data-latest-puzzle="">Quiptic</option>
    </select>
    <fieldset id="day-filter" hidden>
      <input type="radio" name="day" value="" checked>
      <input type="radio" name="day" value="1">
      <input type="radio" name="day" value="2">
      <input type="radio" name="day" value="3">
    </fieldset>
    <input type="text" id="goto-number" name="number">
    <div id="puzzle-suggestions" hidden></div>
    <input type="text" id="goto-room" name="room">
    <div id="room-suggestions" hidden></div>
    <button type="submit">Go</button>
    <button type="button" id="random-btn">Random</button>
    <div id="goto-error"></div>
  </form>
  <li class="crossword-link"><a href="/cryptic/21700">link</a></li>
`;

let navigatedTo;

const loadHomepage = async () => {
  vi.resetModules();
  await import('../homepage.js');
};

// jsdom doesn't implement HTMLFormElement's legacy named-property getter
// (form.series / form.number / form.room). Real browsers do. Polyfill it on
// the fixture form so homepage.js's `form.series.value` etc. resolves.
const polyfillNamedFormControls = (form, names) => {
  names.forEach((name) => {
    Object.defineProperty(form, name, {
      configurable: true,
      get() { return form.elements.namedItem(name); },
    });
  });
};

beforeEach(() => {
  document.body.innerHTML = HTML_FIXTURE;
  polyfillNamedFormControls(
    document.getElementById('goto-form'),
    ['series', 'number', 'room'],
  );
  window.localStorage.clear();
  navigatedTo = null;
  // window.location = url is how homepage.js navigates. Capture the
  // assignment instead of letting jsdom emit a "Not implemented" warning,
  // and keep .pathname/.search readable for the error-banner cleanup logic.
  Object.defineProperty(window, 'location', {
    configurable: true,
    get() { return { pathname: '/', search: '' }; },
    set(value) { navigatedTo = value; },
  });
});

const submitForm = () => {
  const form = document.getElementById('goto-form');
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};

const clickRandom = () => {
  document.getElementById('random-btn').dispatchEvent(
    new Event('click', { bubbles: true }),
  );
};

describe('homepage goToPuzzle', () => {
  it('errors when puzzle is empty and the series has no latest puzzle', async () => {
    await loadHomepage();
    document.getElementById('goto-series').value = 'quiptic';
    // quiptic has data-latest-puzzle="" (no published puzzles yet)
    document.getElementById('goto-number').value = '';

    submitForm();

    expect(navigatedTo).toBeNull();
    expect(document.getElementById('goto-error').textContent)
      .toMatch(/No puzzles available for Quiptic/);
  });

  it('errors when the puzzle number is below the series first_puzzle', async () => {
    await loadHomepage();
    document.getElementById('goto-number').value = '100';

    submitForm();

    expect(navigatedTo).toBeNull();
    expect(document.getElementById('goto-error').textContent)
      .toMatch(/Cryptic puzzles start at No 21620/);
  });

  it('errors when the puzzle number is above the series latest_puzzle', async () => {
    await loadHomepage();
    document.getElementById('goto-number').value = '99999';

    submitForm();

    expect(navigatedTo).toBeNull();
    expect(document.getElementById('goto-error').textContent)
      .toMatch(/Cryptic puzzles only go up to No 21700/);
  });

  it('navigates to /series/number/room when all fields are valid', async () => {
    await loadHomepage();
    document.getElementById('goto-number').value = '21650';
    document.getElementById('goto-room').value = 'my room';

    submitForm();

    // Spaces in the room are percent-encoded; series + number pass through.
    expect(navigatedTo).toBe('/cryptic/21650/my%20room');
    expect(document.getElementById('goto-error').textContent).toBe('');
  });
});

describe('homepage day filter persistence', () => {
  it('hides the filter and resets the radio when switching to a non-cryptic series, without clobbering the stored day', async () => {
    window.localStorage.setItem('last-day', '2');
    await loadHomepage();

    const dayFilter = document.getElementById('day-filter');
    expect(dayFilter.hidden).toBe(false);
    expect(dayFilter.querySelector('input[name="day"][value="2"]').checked).toBe(true);

    const series = document.getElementById('goto-series');
    series.value = 'quiptic';
    series.dispatchEvent(new Event('change', { bubbles: true }));

    expect(dayFilter.hidden).toBe(true);
    expect(dayFilter.querySelector('input[name="day"][value=""]').checked).toBe(true);
    // Programmatic reset to "Any" should NOT have recorded a new last-day,
    // so switching back to cryptic still restores the user's choice.
    expect(window.localStorage.getItem('last-day')).toBe('2');

    series.value = 'cryptic';
    series.dispatchEvent(new Event('change', { bubbles: true }));

    expect(dayFilter.hidden).toBe(false);
    expect(dayFilter.querySelector('input[name="day"][value="2"]').checked).toBe(true);
  });

  it('appends ?day=N to the random URL when a day is selected', async () => {
    window.localStorage.setItem('last-day', '3');
    await loadHomepage();

    clickRandom();

    expect(navigatedTo).toBe('/cryptic/random?day=3');
  });
});
