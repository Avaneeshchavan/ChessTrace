import { useEffect, useState } from 'react';
import { createStockfishClient } from './stockfishClient';

export function useStockfish(fen) {
  const [depth, setDepth] = useState(14);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const key = `${fen}|${depth}`;

  useEffect(() => {
    if (!fen) return;
    let engine;
    let active = true;
    const timer = setTimeout(async () => {
      const turn = fen.split(' ')[1];
      const show = info => {
        if (!active || !info.evaluation) return;
        const { evaluation } = info;
        const whiteScore = evaluation.value * (turn === 'b' ? -1 : 1);
        setFailure(previous => previous?.key === key ? null : previous);
        setResult({ ...info, key, evaluation: { ...evaluation, value: whiteScore } });
      };
      try {
        engine = createStockfishClient();
        const final = await engine.analyze(fen, depth, show);
        if (!final.evaluation) throw new Error('Stockfish returned no evaluation for this position.');
        show(final);
      } catch (error) {
        if (active) setFailure({ key, message: error.message });
      } finally {
        engine?.close();
      }
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
      engine?.close();
    };
  }, [fen, depth, key]);

  const current = result?.key === key ? result : null;
  const error = failure?.key === key ? failure.message : '';
  return {
    ready: !!current,
    depth,
    setDepth,
    evaluation: current?.evaluation,
    bestLine: current?.pv ?? [],
    searchDepthReached: current?.depth ?? 0,
    error,
  };
}
