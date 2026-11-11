export const MOTIFS = ['Pin', 'Fork', 'Skewer', 'Sacrifice', 'Blunder', 'Discovered Attack', 'Deflection', 'Back Rank'];

export function MotifPicker({ value, onChange, disabled }) {
  return (
    <fieldset disabled={disabled} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <legend className="mb-1 font-medium">Motifs</legend>
      {[...new Set([...MOTIFS, ...value])].map(motif => (
        <label key={motif} className="flex items-center gap-1">
          <input type="checkbox" checked={value.includes(motif)} onChange={event =>
            onChange(event.target.checked ? [...value, motif] : value.filter(tag => tag !== motif))
          } />
          {motif}
        </label>
      ))}
    </fieldset>
  );
}
