/**
 * Client-side deterrent against opening DevTools / view-source shortcuts.
 * Not foolproof — determined users can still bypass. Production only.
 */

let lastMessageAt = 0;
const MESSAGE_COOLDOWN_MS = 2500;

export function showBlockMessage() {
  const now = Date.now();
  if (now - lastMessageAt < MESSAGE_COOLDOWN_MS) return;
  lastMessageAt = now;

  try {
    alert('This function is not allowed here.');
  } catch {
    /* ignore */
  }
}

function isEditableTarget(target) {
  return Boolean(
    target?.closest?.('input, textarea, select, option, [contenteditable="true"]'),
  );
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('input, textarea, a, button, select, label'));
}

export function initDevToolsGuard() {
  if (!import.meta.env.PROD) return;

  // --- double-click (reduces quick select → inspect flows) ---
  document.addEventListener(
    'dblclick',
    (e) => {
      if (isInteractiveTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      showBlockMessage();
    },
    true,
  );

  // --- keyboard shortcuts ---
  document.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toUpperCase();

      if (key === 'F12') {
        e.preventDefault();
        showBlockMessage();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C', 'K'].includes(key)) {
        e.preventDefault();
        showBlockMessage();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === 'U') {
        e.preventDefault();
        showBlockMessage();
        return;
      }

      if (e.ctrlKey && e.shiftKey && key === 'S') {
        e.preventDefault();
        showBlockMessage();
        return;
      }

      // Context menu key (some keyboards)
      if (key === 'CONTEXTMENU' || (e.shiftKey && key === 'F10')) {
        if (!isEditableTarget(e.target)) {
          e.preventDefault();
          showBlockMessage();
        }
      }
    },
    true,
  );

  // --- right-click on non-input areas ---
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (isInteractiveTarget(e.target)) return;
      e.preventDefault();
      showBlockMessage();
    },
    true,
  );

  // --- viewport size heuristic (docked DevTools) ---
  const SIZE_THRESHOLD = 160;
  const checkViewport = () => {
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    if (widthGap > SIZE_THRESHOLD || heightGap > SIZE_THRESHOLD) {
      showBlockMessage();
    }
  };
  window.addEventListener('resize', checkViewport);
  setInterval(checkViewport, 1500);

  // --- console getter trick ---
  (function detectDevtoolsWithConsole() {
    let devtoolsOpen = false;
    const detector = {
      get detect() {
        devtoolsOpen = true;
        return 'devtools-detected';
      },
    };

    setInterval(() => {
      devtoolsOpen = false;
      try {
        // eslint-disable-next-line no-console
        console.log(detector);
      } catch {
        /* ignore */
      }

      setTimeout(() => {
        if (devtoolsOpen) showBlockMessage();
      }, 50);
    }, 1500);
  })();
}
