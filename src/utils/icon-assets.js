export const ICON_STYLE = {
  backgroundColor: '#f5f0e8',
  ringColor: '#b65d3a',
  barColor: '#3b2f2a',
  trayStrokeColor: '#2f2723'
};

export const APP_ICON_LAYOUT = {
  size: 1024,
  backgroundRadius: 224,
  ring: {
    cx: 512,
    cy: 512,
    radius: 292,
    strokeWidth: 74
  },
  bars: [
    { x: 362, y: 610, width: 70, height: 116, radius: 35 },
    { x: 477, y: 510, width: 70, height: 216, radius: 35 },
    { x: 592, y: 402, width: 70, height: 324, radius: 35 }
  ]
};

export function buildTrayIconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Z"
        stroke="${ICON_STYLE.trayStrokeColor}"
        stroke-width="1.5"
      />
      <rect x="5.25" y="10.1" width="1.5" height="4.1" rx="0.75" fill="${ICON_STYLE.trayStrokeColor}" />
      <rect x="8.25" y="7.8" width="1.5" height="6.4" rx="0.75" fill="${ICON_STYLE.trayStrokeColor}" />
      <rect x="11.25" y="5.2" width="1.5" height="9.0" rx="0.75" fill="${ICON_STYLE.trayStrokeColor}" />
    </svg>
  `.trim();
}
