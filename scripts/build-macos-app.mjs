import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

import { APP_ICON_LAYOUT, ICON_STYLE } from '../src/utils/icon-assets.js';

const appName = 'Codex Monitor';
const bundleName = `${appName}.app`;
const repoRoot = process.cwd();
const templateApp = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'Electron.app');
const distDir = path.join(repoRoot, 'dist');
const bundlePath = path.join(distDir, bundleName);
const bundleAppPath = path.join(bundlePath, 'Contents', 'Resources', 'app');
const runtimeConfigPath = path.join(bundleAppPath, 'runtime-config.json');
const infoPlistPath = path.join(bundlePath, 'Contents', 'Info.plist');
const iconFileName = `${appName}.icns`;
const iconResourcePath = path.join(bundlePath, 'Contents', 'Resources', iconFileName);
const appEntries = [
  'package.json',
  'package-lock.json',
  'src',
  'node_modules'
];

function hexToRgba(hex) {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointInRoundedRect(x, y, rect) {
  const { x: rectX, y: rectY, width, height, radius } = rect;
  const innerX = rectX + radius;
  const innerY = rectY + radius;
  const innerWidth = width - (radius * 2);
  const innerHeight = height - (radius * 2);

  if (x >= innerX && x <= innerX + innerWidth && y >= rectY && y <= rectY + height) {
    return true;
  }

  if (y >= innerY && y <= innerY + innerHeight && x >= rectX && x <= rectX + width) {
    return true;
  }

  const corners = [
    { cx: rectX + radius, cy: rectY + radius },
    { cx: rectX + width - radius, cy: rectY + radius },
    { cx: rectX + radius, cy: rectY + height - radius },
    { cx: rectX + width - radius, cy: rectY + height - radius }
  ];

  return corners.some(({ cx, cy }) => {
    const dx = x - cx;
    const dy = y - cy;
    return (dx * dx) + (dy * dy) <= radius * radius;
  });
}

function pointInCircleStroke(x, y, circle) {
  const dx = x - circle.cx;
  const dy = y - circle.cy;
  const distance = Math.hypot(dx, dy);
  const halfStroke = circle.strokeWidth / 2;
  return distance >= circle.radius - halfStroke && distance <= circle.radius + halfStroke;
}

function pointInBar(x, y, bar) {
  return pointInRoundedRect(x, y, bar);
}

function sampleIconPixel(sampleX, sampleY) {
  let color = [0, 0, 0, 0];

  if (pointInRoundedRect(sampleX, sampleY, {
    x: 0,
    y: 0,
    width: APP_ICON_LAYOUT.size,
    height: APP_ICON_LAYOUT.size,
    radius: APP_ICON_LAYOUT.backgroundRadius
  })) {
    color = hexToRgba(ICON_STYLE.backgroundColor);
  }

  if (pointInCircleStroke(sampleX, sampleY, APP_ICON_LAYOUT.ring)) {
    color = hexToRgba(ICON_STYLE.ringColor);
  }

  for (const bar of APP_ICON_LAYOUT.bars) {
    if (pointInBar(sampleX, sampleY, bar)) {
      color = hexToRgba(ICON_STYLE.barColor);
    }
  }

  return color;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(width, height, pixelData) {
  const rowLength = (width * 4) + 1;
  const raw = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;
    const sourceRowOffset = y * width * 4;

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = sourceRowOffset + (x * 4);
      const targetOffset = rowOffset + 1 + (x * 4);
      raw[targetOffset] = pixelData[sourceOffset];
      raw[targetOffset + 1] = pixelData[sourceOffset + 1];
      raw[targetOffset + 2] = pixelData[sourceOffset + 2];
      raw[targetOffset + 3] = pixelData[sourceOffset + 3];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function renderIconPng(size) {
  const sampleGrid = [0.25, 0.75];
  const pixelData = Buffer.alloc(size * size * 4);
  const scale = APP_ICON_LAYOUT.size / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const accum = [0, 0, 0, 0];

      for (const sy of sampleGrid) {
        for (const sx of sampleGrid) {
          const [r, g, b, a] = sampleIconPixel((x + sx) * scale, (y + sy) * scale);
          accum[0] += r;
          accum[1] += g;
          accum[2] += b;
          accum[3] += a;
        }
      }

      const offset = (y * size + x) * 4;
      pixelData[offset] = Math.round(accum[0] / 4);
      pixelData[offset + 1] = Math.round(accum[1] / 4);
      pixelData[offset + 2] = Math.round(accum[2] / 4);
      pixelData[offset + 3] = Math.round(accum[3] / 4);
    }
  }

  return encodePng(size, size, pixelData);
}

function makeIcnsBuffer(entries) {
  const chunks = entries.map(({ type, png }) => {
    const typeBuffer = Buffer.from(type, 'ascii');
    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeUInt32BE(png.length + 8, 0);
    return Buffer.concat([typeBuffer, sizeBuffer, png]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

async function buildIconFiles(bundleResourcesDir) {
  const iconTargetPath = path.join(bundleResourcesDir, iconFileName);
  const entries = [
    { size: 16, type: 'icp4' },
    { size: 32, type: 'icp5' },
    { size: 64, type: 'icp6' },
    { size: 128, type: 'ic07' },
    { size: 256, type: 'ic08' },
    { size: 512, type: 'ic09' },
    { size: 1024, type: 'ic10' }
  ];

  await fs.writeFile(iconTargetPath, makeIcnsBuffer(entries.map((entry) => ({
    ...entry,
    png: renderIconPng(entry.size)
  }))));

  return iconTargetPath;
}

async function copyEntry(entry) {
  const sourcePath = path.join(repoRoot, entry);
  try {
    await fs.access(sourcePath);
  } catch {
    return;
  }

  const targetPath = path.join(bundleAppPath, entry);
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    dereference: true
  });
}

async function main() {
  await fs.access(templateApp);
  await fs.rm(bundlePath, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.cp(templateApp, bundlePath, {
    recursive: true,
    dereference: true
  });
  await fs.mkdir(bundleAppPath, { recursive: true });

  await fs.writeFile(runtimeConfigPath, `${JSON.stringify({
    workspaceRoot: repoRoot
  }, null, 2)}\n`);

  for (const entry of appEntries) {
    await copyEntry(entry);
  }

  const bundleResourcesDir = path.join(bundlePath, 'Contents', 'Resources');
  await buildIconFiles(bundleResourcesDir);

  execFileSync('plutil', ['-replace', 'CFBundleDisplayName', '-string', appName, infoPlistPath]);
  execFileSync('plutil', ['-replace', 'CFBundleName', '-string', appName, infoPlistPath]);
  execFileSync('plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.ryukeili.codexmonitor', infoPlistPath]);
  execFileSync('plutil', ['-replace', 'CFBundleIconFile', '-string', appName, infoPlistPath]);

  console.log(`Built ${bundlePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
