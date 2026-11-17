import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, Flame, Play, Search, Brain, Swords, Target, Loader2 } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import ActivityHeatmap from '../components/ActivityHeatmap';

function ActivityIcon({ type }) {
  switch (type) {
    case 'LENS_SEARCH': return <Search size={16} className="text-[var(--ct-accent)]" />;
    case 'TURNING_POINTS_RUN': return <Brain size={16} className="text-[var(--ct-accent)]" />;
    case 'PUZZLE_SAVED': return <Target size={16} className="text-[var(--ct-accent)]" />;
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

const tools = [
  { to: '/lens', title: 'Origin Lens', detail: 'Trace a screenshot to real games.', Icon: Search },
  { to: '/sandbox', title: 'Sandbox', detail: 'Play a position and test your ideas.', Icon: Swords },
  { to: '/vault', title: 'Pattern Vault', detail: 'Review the positions you saved.', Icon: Bookmark },
  { to: '/turning-points', title: 'Turning Points', detail: 'Find critical moves in a PGN.', Icon: Brain },
];

export default function Dashboard() {
  const { data, isLoading, error, status } = useDashboard();
  const { stats, streak, heatmap, recentActivity } = data || {};
  const loadingActivity = status !== 'error' && isLoading;
  const activityError = status === 'error' || error;

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="ct-display text-5xl">Study room</h1>
          <p className="mt-2 text-sm text-slate-500">Choose what to study next.</p>
        </div>
        {data && <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-accent">
          <Flame size={17} aria-hidden="true" />
          <span>{streak ?? 0} day streak</span>
        </div>}
      </header>
      <section className="mb-8" aria-label="Study tools">
        <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-2 xl:grid-cols-4">
          {tools.map(({ to, title, detail, Icon }) => (
            <Link key={to} to={to} className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-accent">
              <span className="rounded-lg bg-slate-100 p-2.5 text-accent"><Icon size={19} aria-hidden="true" /></span>
              <span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
              <ArrowRight size={16} className="text-accent" aria-hidden="true" />
            </Link>
          ))}
        </div>
        <Link to="/#sample-game" className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm hover:border-accent">
          <Play size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <span><strong>The Opera Game</strong><span className="ml-2 text-slate-500">Follow Morphy’s finish.</span></span>
          <ArrowRight size={16} className="ml-auto shrink-0 text-accent" aria-hidden="true" />
        </Link>
      </section>
      {loadingActivity && <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
        <Loader2 size={17} className="animate-spin" aria-hidden="true" /> Loading your activity…
      </p>}
      {activityError && <p className="text-sm text-red-700" role="alert">Your activity couldn’t load. You can still open a study tool.</p>}
      {!loadingActivity && !activityError && (
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
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">Activity (Last 90 Days)</h2>
            <ActivityHeatmap data={heatmap} />
          </div>

        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 flex flex-col h-full max-h-[800px]">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">Recent Activity</h2>
          
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
      )}
    </main>
  );
}
