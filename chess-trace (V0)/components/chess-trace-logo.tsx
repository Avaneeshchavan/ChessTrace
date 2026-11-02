import { ChessKnight } from 'lucide-react'

export function ChessTraceLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#769656] shadow-[0_4px_10px_rgba(118,150,86,0.22)]">
        <ChessKnight className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden="true" />
      </div>
      <span className="text-xl font-semibold tracking-tight text-slate-900">ChessTrace</span>
    </div>
  )
}
