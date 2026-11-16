export function GameInput({ input, setInput, username, setUsername, month, setMonth, disabled, placeholder, required }) {
  const isChessCom = /^https:\/\/(www\.)?chess\.com\//i.test(input.trim());
  return (
    <>
      <label className="block text-sm font-medium">
        Game link or PGN
        <textarea value={input} onChange={event => setInput(event.target.value)} disabled={disabled}
          placeholder={placeholder} required={required} rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-sm" />
      </label>
      {isChessCom && <>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Either player’s Chess.com username
            <input required value={username} onChange={event => setUsername(event.target.value)} disabled={disabled}
              className="block rounded border border-slate-300 p-2" />
          </label>
          <label className="text-sm">Month the game ended (UTC)
            <input required type="month" value={month} onChange={event => setMonth(event.target.value)} disabled={disabled}
              className="block rounded border border-slate-300 p-2" />
          </label>
        </div>
        <p className="text-xs text-slate-500">ChessTrace is independent and unaffiliated with Chess.com.</p>
      </>}
    </>
  );
}
