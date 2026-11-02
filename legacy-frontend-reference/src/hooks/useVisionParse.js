import { useCallback, useState } from 'react';

const VISION_API_URL = import.meta.env.VITE_VISION_API_URL || 'http://localhost:8000';

/**
 * Wraps POST {VISION_API_URL}/parse-screenshot.
 *
 * Coded against the live response shape you gave me (not a guess):
 *   fen, fen_valid, fen_validation_error, piece_placement_field,
 *   best_effort_fields{active_color, active_color_is_default,
 *     castling_availability, castling_is_heuristic,
 *     en_passant_target, en_passant_is_default},
 *   halfmove_clock, fullmove_number, clocks_are_placeholder,
 *   theme_used, theme_match_confidence, theme_auto_detected,
 *   orientation, orientation_method, squares[], low_confidence_squares[],
 *   warnings[]
 */
export function useVisionParse() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const parseScreenshot = useCallback(async (file) => {
    setStatus('loading');
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch(`${VISION_API_URL}/parse-screenshot`, {
        method: 'POST',
        body,
      });

      if (!res.ok) {
        throw new Error(`Vision service returned ${res.status}`);
      }

      const data = await res.json();

      if (!data.fen_valid) {
        // Not a network/HTTP failure — a well-formed response telling us
        // the board it read isn't legal-shaped. Surface inline, don't throw.
        setResult(data);
        setStatus('error');
        setError(data.fen_validation_error || 'Detected position is not valid.');
        return data;
      }

      setResult(data);
      setStatus('success');
      return data;
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not reach the vision service.');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, parseScreenshot, reset };
}
