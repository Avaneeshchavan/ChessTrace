'use client'

import { EngineRoomPanel } from './engine-room'

export function SandboxPage() {
  return (
    <div className="p-8 flex gap-6">
      {/* Left: Board Area */}
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Blueprint Sandbox</h1>
        
        {/* Board Mount */}
        <div
          id="board-mount"
          className="w-full aspect-square bg-white border-2 border-slate-300 rounded-lg mb-6 flex items-center justify-center text-slate-400"
        >
          <div className="text-center">
            <div className="text-6xl mb-2">♔</div>
            <p className="text-slate-500">Chess board will render here</p>
          </div>
        </div>

        {/* Piece Tray */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Piece Tray</h3>
          <div className="grid grid-cols-8 gap-2">
            {['♔', '♕', '♖', '♗', '♘', '♙', '♚', '♛', '♜', '♝', '♞', '♟'].map((piece, i) => (
              <div key={i} className="aspect-square bg-slate-50 border border-slate-200 rounded flex items-center justify-center text-2xl cursor-grab hover:bg-slate-100">
                {piece}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Control Panel */}
      <div className="w-72 flex flex-col gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <label className="text-xs font-bold text-slate-900 block mb-2">FEN Position</label>
          <input
            type="text"
            defaultValue="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded font-mono text-slate-700"
            readOnly
          />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Position Status</h3>
          <div className="inline-flex items-center gap-2 bg-[#769656]/10 border border-[#769656]/30 text-[#769656] text-xs font-semibold px-3 py-2 rounded-md">
            <span className="w-2 h-2 bg-[#769656] rounded-full" />
            Valid Position
          </div>
        </div>

        <EngineRoomPanel />
      </div>
    </div>
  )
}
