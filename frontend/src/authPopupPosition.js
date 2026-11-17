const finite = (value) => typeof value === "number" && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;

// All values use CSS pixels. Explicit monitor origins keep secondary displays,
// including monitors to the left or above the primary display, in their space.
export function getAuthPopupGeometry({ anchorRect, windowBounds = {}, screenBounds = {} } = {}) {
  const windowLeft = finite(windowBounds.left) ? windowBounds.left : finite(screenBounds.left) ? screenBounds.left : 0;
  const windowTop = finite(windowBounds.top) ? windowBounds.top : finite(screenBounds.top) ? screenBounds.top : 0;
  const windowWidth = positive(windowBounds.width) ? windowBounds.width : positive(windowBounds.innerWidth)
    ? windowBounds.innerWidth : positive(screenBounds.width) ? screenBounds.width : 1280;
  const windowHeight = positive(windowBounds.height) ? windowBounds.height : positive(windowBounds.innerHeight)
    ? windowBounds.innerHeight : positive(screenBounds.height) ? screenBounds.height : 900;

  // When a browser doesn't expose a monitor origin, use its current window as
  // the safe fallback instead of incorrectly clamping a second monitor to zero.
  const leftBound = finite(screenBounds.left) ? screenBounds.left : windowLeft;
  const topBound = finite(screenBounds.top) ? screenBounds.top : windowTop;
  const availableWidth = finite(screenBounds.left) && positive(screenBounds.width) ? screenBounds.width : windowWidth;
  const availableHeight = finite(screenBounds.top) && positive(screenBounds.height) ? screenBounds.height : windowHeight;
  const margin = 16;
  const width = Math.min(520, Math.max(1, availableWidth - margin * 2));
  const height = Math.min(680, Math.max(1, availableHeight - margin * 2));

  let centerX = windowLeft + windowWidth / 2;
  let centerY = windowTop + windowHeight / 2;
  if (anchorRect && finite(anchorRect.left) && finite(anchorRect.top) && positive(anchorRect.width) && positive(anchorRect.height)) {
    const horizontalFrame = positive(windowBounds.innerWidth) ? Math.max(0, Math.min(16, (windowWidth - windowBounds.innerWidth) / 2)) : 0;
    // Cap the frame estimate so docked devtools don't look like browser chrome.
    const topFrame = positive(windowBounds.innerHeight) ? Math.max(0, Math.min(120, windowHeight - windowBounds.innerHeight)) : 0;
    centerX = windowLeft + horizontalFrame + anchorRect.left + anchorRect.width / 2;
    centerY = windowTop + topFrame + anchorRect.top + anchorRect.height / 2;
  }

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(clamp(centerX - width / 2, leftBound + margin, leftBound + availableWidth - width - margin)),
    top: Math.round(clamp(centerY - height / 2, topBound + margin, topBound + availableHeight - height - margin)),
  };
}

export function getAuthPopupFeatures(anchor) {
  const geometry = getAuthPopupGeometry({
    anchorRect: anchor?.getBoundingClientRect(),
    windowBounds: {
      left: window.screenX ?? window.screenLeft,
      top: window.screenY ?? window.screenTop,
      width: window.outerWidth,
      height: window.outerHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    screenBounds: {
      left: window.screen?.availLeft,
      top: window.screen?.availTop,
      width: window.screen?.availWidth,
      height: window.screen?.availHeight,
    },
  });
  return `popup=yes,width=${geometry.width},height=${geometry.height},left=${geometry.left},top=${geometry.top}`;
}
