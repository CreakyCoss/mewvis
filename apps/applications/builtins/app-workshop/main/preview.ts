// Keep inspection and native scrolling available without activating the app.
export const previewInteractionStyle = `
  :root, :root *, :root *::before, :root *::after {
    cursor: default !important;
  }
`;

// This runs inside the existing opaque sandbox before the application bundle.
export const previewInteractionGuard = `(() => {
  const stop = event => event.stopImmediatePropagation();
  const cancel = event => { event.preventDefault(); stop(event); };
  for (const type of ['click', 'dblclick', 'auxclick', 'submit', 'reset', 'beforeinput', 'input', 'change', 'dragstart', 'drop', 'contextmenu'])
    window.addEventListener(type, cancel, true);
  for (const type of ['wheel', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'focusin', 'focusout'])
    window.addEventListener(type, stop, { capture: true, passive: true });
  const navigation = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  window.addEventListener('keydown', event => {
    stop(event);
    const copy = (event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase());
    if (!navigation.has(event.key) && !copy) event.preventDefault();
    if (event.key !== 'Tab' && !copy && event.target instanceof Element && event.target.closest('button, input, select, textarea, a, [role="button"], [contenteditable]')) event.preventDefault();
  }, true);
  window.addEventListener('keyup', cancel, true);
  const markControls = () => {
    for (const element of document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [contenteditable]')) {
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('tabindex', '-1');
    }
  };
  new MutationObserver(markControls).observe(document, { childList: true, subtree: true });
  markControls();
})();\n`;
