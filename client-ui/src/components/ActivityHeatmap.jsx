import { useMemo } from 'react';

export default function ActivityHeatmap({ data = {} }) {
  const days = useMemo(() => {
    const arr = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      arr.push({
        date: dateStr,
        count: data[dateStr] || 0
      });
    }
    return arr;
  }, [data]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1">
        {days.map((day, idx) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.count} activities`}
            className={`w-3 h-3 rounded-sm ${
              day.count === 0 
                ? 'bg-slate-100' 
                : day.count < 3 
                  ? 'bg-[#598096]/40' 
                  : day.count < 6 
                    ? 'bg-[#598096]/70' 
                    : 'bg-[#598096]'
            }`}
          />
        ))}
      </div>
      <div className="text-xs text-slate-400 flex justify-between w-full">
        <span>90 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}
