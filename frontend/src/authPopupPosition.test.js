import { getAuthPopupGeometry } from "./authPopupPosition";

const browser = { left: 100, top: 100, width: 1000, height: 800, innerWidth: 1000, innerHeight: 700 };
const monitor = { left: 0, top: 0, width: 1920, height: 1080 };

test("positions the popup around the clicked button in the current browser", () => {
  expect(getAuthPopupGeometry({
    anchorRect: { left: 650, top: 200, width: 100, height: 50 },
    windowBounds: browser, screenBounds: monitor,
  })).toEqual({ width: 520, height: 680, left: 540, top: 85 });
});

test("falls back to centering over the current browser when no button position exists", () => {
  expect(getAuthPopupGeometry({ windowBounds: browser, screenBounds: monitor }))
    .toEqual({ width: 520, height: 680, left: 340, top: 160 });
});

test("clamps the popup on a monitor with negative coordinates", () => {
  const result = getAuthPopupGeometry({
    anchorRect: { left: 0, top: 0, width: 100, height: 50 },
    windowBounds: { ...browser, left: -1920, top: -1080 },
    screenBounds: { left: -1920, top: -1080, width: 1920, height: 1080 },
  });
  expect(result).toEqual({ width: 520, height: 680, left: -1904, top: -1064 });
});

test("stays on a secondary monitor to the right and inside its right and bottom edges", () => {
  const result = getAuthPopupGeometry({
    anchorRect: { left: 1500, top: 900, width: 100, height: 50 },
    windowBounds: { ...browser, left: 1920, top: 0, width: 1600, height: 1000 },
    screenBounds: { left: 1920, top: 0, width: 1600, height: 1000 },
  });
  expect(result.left).toBe(3520 - 520 - 16);
  expect(result.top).toBe(1000 - 680 - 16);
});

test("fits smaller screens with an inset on every edge", () => {
  expect(getAuthPopupGeometry({
    windowBounds: { left: 0, top: 0, width: 360, height: 640 },
    screenBounds: { left: 0, top: 0, width: 360, height: 640 },
  })).toEqual({ width: 328, height: 608, left: 16, top: 16 });
});

test("missing screen information keeps the fallback on the current negative-position window", () => {
  const result = getAuthPopupGeometry({ windowBounds: { ...browser, left: -1500 } });
  expect(result.left).toBe(-1260);
  expect(result.top).toBe(160);
  expect(getAuthPopupGeometry()).toEqual({ width: 520, height: 680, left: 380, top: 110 });
});
