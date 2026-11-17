export const MIN_CROP_SIZE = 64;
const clamp = (n, min, max) => Math.round(Math.max(min, Math.min(max, n)));

export function fitCrop({ x, y, size }, width, height) {
  const side = clamp(size, MIN_CROP_SIZE, Math.min(width, height));
  return { size: side, x: clamp(x, 0, width - side), y: clamp(y, 0, height - side) };
}

export function dragCorner(crop, corner, dx, dy, width, height) {
  const left = corner.includes('w');
  const top = corner.includes('n');
  const anchorX = crop.x + (left ? crop.size : 0);
  const anchorY = crop.y + (top ? crop.size : 0);
  const limit = Math.min(left ? anchorX : width - anchorX, top ? anchorY : height - anchorY);
  const size = clamp(crop.size + ((left ? -dx : dx) + (top ? -dy : dy)) / 2, MIN_CROP_SIZE, limit);
  return { x: anchorX - (left ? size : 0), y: anchorY - (top ? size : 0), size };
}
