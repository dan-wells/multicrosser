import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Crossword } from '@guardian/react-crossword';
import './lib/crossword-overrides.css';
import './lib/print-overrides.css';

const mountElement = document.getElementsByClassName('js-print-crossword')[0];
const printPage = mountElement.closest('.print-page');
const crosswordData = JSON.parse(mountElement.dataset.crossword);
const sourceType = mountElement.dataset.source;

if (sourceType === 'nytimes' && crosswordData.dimensions.cols >= 17) {
  printPage.classList.add('print-large');
}

const blankProgress = Array.from({ length: crosswordData.dimensions.cols }, () =>
  Array.from({ length: crosswordData.dimensions.rows }, () => '')
);

const rootStyle = getComputedStyle(document.documentElement);
const selectedBackgroundColor = rootStyle.getPropertyValue('--crossword-selected-color').trim();
const gridBackgroundColor = rootStyle.getPropertyValue('--crossword-grid-background-color').trim();

// Render into a hidden staging element; we'll extract the parts we want into
// our own layout. The library's outer flex container, min-height: 100vh, and
// responsive breakpoints would otherwise fight every layout rule we set.
const staging = document.createElement('div');
staging.style.position = 'absolute';
staging.style.left = '-99999px';
staging.style.top = '0';
staging.style.width = '1200px';  // wide enough to force the side-by-side layout, then we extract
document.body.appendChild(staging);

const root = createRoot(staging);
flushSync(() => {
  root.render(<Crossword
    data={crosswordData}
    progress={blankProgress}
    onMove={() => {}}
    selectedBackgroundColor={selectedBackgroundColor}
    gridBackgroundColor={gridBackgroundColor}
  />);
});

// Mirror crossword.js cell tagging so crossword-overrides.css's selectors apply.
staging.querySelectorAll('g[role="cell"]').forEach((cellGroup) => {
  if (cellGroup.querySelector('foreignObject')) {
    cellGroup.setAttribute('data-clue-cell', 'true');
  } else {
    cellGroup.setAttribute('data-black-cell', 'true');
  }
});

// Cap the wait-for-mount retry so a library regression that never renders
// listboxes throws a visible error instead of looping forever.
const MAX_LAYOUT_RETRIES = 60;

function buildLayout(retries = 0) {
  const grid = staging.querySelector('svg[role="grid"]');
  const listboxes = Array.from(staging.querySelectorAll('[role="listbox"]'));
  if (!grid || listboxes.length < 2) {
    if (retries >= MAX_LAYOUT_RETRIES) {
      throw new Error('Crossword grid or clue list failed to render');
    }
    requestAnimationFrame(() => buildLayout(retries + 1));
    return;
  }

  // For each listbox, its parent is the section (label + listbox container).
  const acrossSection = listboxes[0].parentElement;
  const downSection = listboxes[1].parentElement;

  // The library renders a "CluesHeader" div (2em height, dotted bottom border)
  // before each listbox. Tag it so CSS can flatten it.
  [acrossSection, downSection].forEach((section) => {
    Array.from(section.children).forEach((child) => {
      if (child.getAttribute('role') !== 'listbox' && child.tagName !== 'LABEL') {
        child.classList.add('print-clue-header');
      }
    });
  });

  const layout = document.createElement('div');
  layout.className = 'print-layout';

  const gridWrap = document.createElement('div');
  gridWrap.className = 'print-grid';
  gridWrap.appendChild(grid);

  if (printPage.classList.contains('print-large')) {
    buildLargeNytLayout(layout, gridWrap, acrossSection, downSection);
  } else {
    const cluesWrap = document.createElement('div');
    cluesWrap.className = 'print-clues';
    cluesWrap.appendChild(acrossSection);
    cluesWrap.appendChild(downSection);
    layout.appendChild(gridWrap);
    layout.appendChild(cluesWrap);
  }

  mountElement.innerHTML = '';
  mountElement.appendChild(layout);
  root.unmount();
  staging.remove();
}

// Sunday NYT: 4 visual columns. Column 1 is a single clue stream spanning the
// full layout height. Columns 2-4 hold the grid on top and a 3-column clue
// block below. We move items from the bottom block into column 1 until the
// two streams end at the same y-position (no gap below column 1).
function buildLargeNytLayout(layout, gridWrap, acrossSection, downSection) {
  const left = document.createElement('div');
  left.className = 'print-clues print-clues-left';

  const bottom = document.createElement('div');
  bottom.className = 'print-clues print-clues-bottom';

  [acrossSection, downSection].forEach((section) => {
    Array.from(section.children).forEach((child) => {
      if (child.getAttribute('role') === 'listbox') {
        Array.from(child.children).forEach((opt) => bottom.appendChild(opt));
      } else {
        bottom.appendChild(child);
      }
    });
  });

  // Grid placement is controlled by CSS Grid (grid-row: 1, cols 2-4).
  layout.appendChild(left);
  layout.appendChild(gridWrap);
  layout.appendChild(bottom);

  // After the layout is mounted, iteratively move items from the bottom block
  // into the left column until they end at the same y. We measure each
  // container's CONTENT bottom (last child) rather than its box bottom: left
  // is a grid item spanning two rows, so its box always equals the full grid
  // area height regardless of content.
  requestAnimationFrame(() => {
    const contentBottom = (el) => {
      const last = el.lastElementChild;
      return last ? last.getBoundingClientRect().bottom
                  : el.getBoundingClientRect().top;
    };
    let safety = 500;
    while (bottom.firstChild && safety-- > 0) {
      if (contentBottom(left) >= contentBottom(bottom)) break;
      left.appendChild(bottom.firstChild);
    }
  });
}

requestAnimationFrame(() => requestAnimationFrame(buildLayout));
