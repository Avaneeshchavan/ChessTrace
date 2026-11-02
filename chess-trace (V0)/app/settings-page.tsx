'use client'

export function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Settings</h1>

      {/* Account Section */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Account</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Email</label>
            <input
              type="email"
              defaultValue="player@chesstrace.app"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Display Name</label>
            <input
              type="text"
              defaultValue="GrandmasterJones"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>
          <button className="px-4 py-2 bg-[#769656] text-white rounded-lg font-semibold hover:bg-[#5a4d3a] transition-colors">
            Save Changes
          </button>
        </div>
      </div>

      {/* Board Preferences */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Board Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Board Theme</label>
            <select className="w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50">
              <option>Classic (Tournament Green)</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Piece Set</label>
            <select className="w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50">
              <option>Standard</option>
              <option>Wooden</option>
              <option>Minimal</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="coords" defaultChecked className="w-4 h-4" />
            <label htmlFor="coords" className="text-sm text-slate-900">Show board coordinates</label>
          </div>
        </div>
      </div>

      {/* Engine Settings */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Engine</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Default Analysis Depth</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="25"
                defaultValue="20"
                className="flex-1"
              />
              <span className="text-sm font-mono text-slate-900 w-8 text-right">20</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="multi" defaultChecked className="w-4 h-4" />
            <label htmlFor="multi" className="text-sm text-slate-900">Multi-line analysis</label>
          </div>
        </div>
      </div>
    </div>
  )
}
