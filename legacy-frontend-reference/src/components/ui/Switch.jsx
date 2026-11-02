import {
  forwardRef,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const springs = {
  moderate: { type: "spring", duration: 0.16, bounce: 0.15 },
};

const TRACK_WIDTH = 34;
const TRACK_HEIGHT = 20;
const THUMB_SIZE = 16;
const THUMB_OFFSET = 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET * 2;
const PILL_EXTEND = 2;
const PRESS_EXTEND = 4;
const PRESS_SHRINK = 4;
const DRAG_DEAD_ZONE = 2;

const Switch = forwardRef(
  ({ label, checked, onToggle, disabled = false, className, ...props }, ref) => {
    const hasMounted = useRef(false);
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);

    const dragging = useRef(false);
    const didDrag = useRef(false);
    const pointerStart = useRef(null);

    const motionX = useMotionValue(checked ? THUMB_OFFSET + THUMB_TRAVEL : THUMB_OFFSET);

    useEffect(() => { hasMounted.current = true; }, []);

    const thumbWidth = pressed ? THUMB_SIZE + PRESS_EXTEND : hovered ? THUMB_SIZE + PILL_EXTEND : THUMB_SIZE;
    const thumbHeight = pressed ? THUMB_SIZE - PRESS_SHRINK : THUMB_SIZE;
    const thumbY = pressed ? THUMB_OFFSET + PRESS_SHRINK / 2 : THUMB_OFFSET;
    const extraWidth = thumbWidth - THUMB_SIZE;
    const thumbX = checked ? THUMB_OFFSET + THUMB_TRAVEL - extraWidth : THUMB_OFFSET;

    useEffect(() => {
      if (dragging.current) return;
      if (!hasMounted.current) {
        motionX.set(thumbX);
      } else {
        animate(motionX, thumbX, springs.moderate);
      }
    }, [thumbX, motionX]);

    const handlePointerDown = useCallback((e) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      setPressed(true);
      dragging.current = false;
      didDrag.current = false;
      pointerStart.current = { clientX: e.clientX, originX: motionX.get() };
      e.currentTarget.setPointerCapture(e.pointerId);
    }, [disabled, motionX]);

    const handlePointerMove = useCallback((e) => {
      if (!pointerStart.current) return;
      const delta = e.clientX - pointerStart.current.clientX;
      if (!dragging.current) {
        if (Math.abs(delta) < DRAG_DEAD_ZONE) return;
        dragging.current = true;
      }
      const dragMin = THUMB_OFFSET;
      const dragMax = TRACK_WIDTH - THUMB_OFFSET - (THUMB_SIZE + PRESS_EXTEND);
      motionX.set(Math.max(dragMin, Math.min(dragMax, pointerStart.current.originX + delta)));
    }, [motionX]);

    const handlePointerUp = useCallback(() => {
      if (!pointerStart.current) return;
      setPressed(false);
      if (dragging.current) {
        didDrag.current = true;
        dragging.current = false;
        const currentX = motionX.get();
        const dragMin = THUMB_OFFSET;
        const dragMax = TRACK_WIDTH - THUMB_OFFSET - (THUMB_SIZE + PRESS_EXTEND);
        const shouldBeOn = currentX > (dragMin + dragMax) / 2;
        if (shouldBeOn !== checked) {
          onToggle();
        } else {
          animate(motionX, checked ? THUMB_OFFSET + THUMB_TRAVEL : THUMB_OFFSET, springs.moderate);
        }
        requestAnimationFrame(() => { didDrag.current = false; });
      }
      pointerStart.current = null;
    }, [checked, onToggle, motionX]);

    return (
      <div
        ref={ref}
        className={cn(
          "relative z-10 flex items-center justify-between gap-3 px-3 py-2 cursor-pointer select-none touch-none rounded-md bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors",
          disabled && "opacity-50 pointer-events-none",
          className
        )}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => { if (disabled || didDrag.current) return; onToggle(); }}
        {...props}
      >
        <span className="text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors duration-200">
          {label}
        </span>
        <SwitchPrimitive.Root
          checked={checked}
          onCheckedChange={() => { if (didDrag.current) return; onToggle(); }}
          disabled={disabled}
          tabIndex={0}
          className={cn(
            "relative shrink-0 rounded-full outline-none cursor-pointer transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
            checked ? "bg-blue-600" : "bg-slate-200"
          )}
          style={{
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <SwitchPrimitive.Thumb asChild>
            <motion.span
              className="absolute top-0 left-0 block rounded-full bg-white shadow-sm"
              initial={false}
              style={{ x: motionX }}
              animate={{ y: thumbY, width: thumbWidth, height: thumbHeight }}
              transition={hasMounted.current ? springs.moderate : { duration: 0 }}
            />
          </SwitchPrimitive.Thumb>
        </SwitchPrimitive.Root>
      </div>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
