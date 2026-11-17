import { useRef, useState } from 'react';
import { dragCorner, fitCrop } from '../../utils/boardCrop';

const corners = { nw: 'Top left', ne: 'Top right', sw: 'Bottom left', se: 'Bottom right' };
const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const distance = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);

export function BoardCrop({ preview, proposal, offline, onConfirm }) {
  const { width, height, fallback } = proposal;
  const [crop, setCrop] = useState(proposal.crop);
  const frame = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  function point(event) {
    const rect = frame.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
  }

  function begin(event, corner) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, point(event));
    gesture.current = { crop, corner, points: [...pointers.current.values()] };
  }

  function move(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, point(event));
    const points = [...pointers.current.values()];
    const start = gesture.current;
    if (points.length === 2 && start.points.length === 2) {
      const initial = distance(start.points);
      const size = start.crop.size * (initial ? distance(points) / initial : 1);
      const offset = (start.crop.size - size) / 2;
      setCrop(fitCrop({ x: start.crop.x + offset, y: start.crop.y + offset, size }, width, height));
    } else if (points.length === 1 && start.points.length === 1) {
      const dx = points[0].x - start.points[0].x;
      const dy = points[0].y - start.points[0].y;
      setCrop(start.corner
        ? dragCorner(start.crop, start.corner, dx, dy, width, height)
        : fitCrop({ ...start.crop, x: start.crop.x + dx, y: start.crop.y + dy }, width, height));
    }
  }

  function end(event) {
    pointers.current.delete(event.pointerId);
  }

  function keyboard(event, corner) {
    const direction = arrows[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const [dx, dy] = direction.map(value => value * (event.shiftKey ? 10 : 2));
    setCrop(current => corner
      ? dragCorner(current, corner, dx * 2, dy * 2, width, height)
      : fitCrop({ ...current, x: current.x + dx, y: current.y + dy }, width, height));
  }

  return <section className="ct-panel space-y-3 p-3" aria-label="Crop the chessboard">
    <h2 className="font-semibold">Crop the chessboard</h2>
    {fallback && <p role="status" className="text-sm text-amber-700">The scanner could not find the board edges. A centered crop is shown. Adjust or confirm the crop before scanning.</p>}
    <p id="crop-help" className="text-sm">Drag or pinch the square to fit the board. Use arrow keys to move the crop or resize a focused corner.</p>
    <div ref={frame} className="board-crop-frame" style={{ aspectRatio: width + '/' + height, maxWidth: `min(36rem, ${60 * width / height}dvh)` }}
      onPointerDown={event => begin(event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={end}>
      <img src={preview} alt="Screenshot being cropped" draggable="false" />
      <div role="group" tabIndex={0} aria-label="Crop position" aria-describedby="crop-help"
        className="board-crop-box" style={{
          left: crop.x / width * 100 + '%', top: crop.y / height * 100 + '%',
          width: crop.size / width * 100 + '%', height: crop.size / height * 100 + '%',
        }} onKeyDown={keyboard}>
        {Object.entries(corners).map(([key, label]) => <button key={key} type="button"
          className="board-crop-handle" data-corner={key} aria-label={label + ' crop corner'}
          onPointerDown={event => begin(event, key)} onKeyDown={event => keyboard(event, key)} />)}
      </div>
    </div>
    <button type="button" className="ct-button" disabled={offline} onClick={() => onConfirm(crop)}>Looks right</button>
    <button type="button" className="ct-quiet ml-2" onClick={() => setCrop(proposal.crop)}>Reset crop</button>
  </section>;
}
