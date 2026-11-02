import { ChessTraceLogo } from '@/components/chess-trace-logo'

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f4ef] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_2px_8px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <ChessTraceLogo />
          <p className="mt-5 text-sm text-slate-600">Sign in to your account</p>
        </div>

        <form className="mt-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#769656] focus:ring-2 focus:ring-[#769656]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <a href="#" className="text-xs font-medium text-slate-500 transition hover:text-[#769656]">
                Forgot password?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#769656] focus:ring-2 focus:ring-[#769656]"
            />
          </div>

          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-[#769656] text-sm font-semibold text-white shadow-sm transition hover:bg-[#648149] focus:outline-none focus:ring-2 focus:ring-[#769656] focus:ring-offset-2"
          >
            Sign In
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <a href="#" className="font-medium text-slate-600 transition hover:text-[#769656]">
            Create an account
          </a>
        </p>
      </section>
    </main>
  )
}
