import { Link } from 'react-router-dom';
import { ArrowRight, Flame, Search, Brain, Target, Loader2 } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import ActivityHeatmap from '../components/ActivityHeatmap';

function ActivityIcon({ type }) {
  switch (type) {
    case 'LENS_SEARCH': return <Search size={16} className="text-[#3b759e]" />;
    case 'TURNING_POINTS_RUN': return <Brain size={16} className="text-[#3b759e]" />;
    case 'PUZZLE_SAVED': return <Target size={16} className="text-[#3b759e]" />;
    default: return <div className="w-4 h-4 rounded-full bg-slate-300" />;
  }
}

function formatActivityMessage(log) {
  switch (log.type) {
    case 'LENS_SEARCH': return 'Searched for a position via Origin Lens';
    case 'TURNING_POINTS_RUN': 
      return `Analyzed a game (${log.metadata?.blundersFound || 0} blunders found)`;
    case 'PUZZLE_SAVED':
      return `Saved a puzzle${log.metadata?.theme ? ` (Theme: ${log.metadata.theme})` : ''}`;
    default:
      return 'Activity recorded';
  }
}

export default function Dashboard() {
  const { data, isLoading, error, status } = useDashboard();

  if (status === 'waking' || status === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#3b759e]">
        <div className="animate-pulse font-medium">Waiting for servers to wake up...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <Loader2 size={48} className="text-[#3b759e] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        <p>Error loading dashboard: {error}</p>
      </div>
    );
  }

  const { stats, streak, heatmap, recentActivity } = data || {};

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2">Dashboard</h1>
          <p className="text-slate-500 text-sm">Your chess analysis at a glance.</p>
        </div>
        <div className="flex items-center gap-2 bg-[#3b759e]/10 text-[#3b759e] px-4 py-2 rounded-full font-bold">
          <Flame size={20} className={streak > 0 ? 'text-orange-500' : 'text-[#3b759e]/50'} />
          <span>{streak} Day Streak</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Heatmap */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">Puzzles Saved</div>
              <div className="text-3xl font-semibold tracking-tight text-slate-900">{stats?.totalPuzzles || 0}</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">Lens Searches</div>
              <div className="text-3xl font-semibold tracking-tight text-slate-900">{stats?.totalSearches || 0}</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">Games Analyzed</div>
              <div className="text-3xl font-semibold tracking-tight text-slate-900">{stats?.totalTurningPoints || 0}</div>
            </div>
          </div>

          {/* Heatmap */}
          <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 overflow-x-auto">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">Activity (Last 90 Days)</h3>
            <ActivityHeatmap data={heatmap} />
          </div>

          {/* Quick Launch Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link to="/lens" className="group bg-[#3b759e] rounded-xl p-6 text-white hover:bg-[#2c5a7a] transition-colors relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-xl font-semibold tracking-tight mb-2">Origin Lens</h3>
                <p className="text-white/80 text-sm mb-4">Analyze a position screenshot</p>
                <div className="flex items-center gap-1 font-semibold text-sm">
                  Launch <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              <Search size={100} className="absolute -right-6 -bottom-6 text-white/10 group-hover:scale-110 transition-transform duration-300" />
            </Link>

            <Link to="/turning-points" className="group bg-slate-800 rounded-xl p-6 text-white hover:bg-slate-900 transition-colors relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-xl font-semibold tracking-tight mb-2">Turning Points</h3>
                <p className="text-slate-400 text-sm mb-4">Batch analyze a PGN</p>
                <div className="flex items-center gap-1 font-semibold text-sm text-[#3b759e]">
                  Launch <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              <Brain size={100} className="absolute -right-6 -bottom-6 text-white/5 group-hover:scale-110 transition-transform duration-300" />
            </Link>
          </div>

        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 flex flex-col h-full max-h-[800px]">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">Recent Activity</h3>
          
          <div className="flex-1 overflow-y-auto pr-2">
            {!recentActivity || recentActivity.length === 0 ? (
              <div className="text-center text-slate-500 py-10">
                <p>No activity yet.</p>
                <p className="text-sm mt-2">Try searching a position or saving a puzzle!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {recentActivity.map((log) => (
                  <div key={log.id} className="flex gap-4 relative">
                    <div className="absolute left-[11px] top-[24px] bottom-[-24px] w-px bg-slate-200 last:hidden" />
                    <div className="relative z-10 w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <ActivityIcon type={log.type} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-900 font-medium">{formatActivityMessage(log)}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(log.createdAt).toLocaleString(undefined, { 
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
