import { Component, type ReactNode } from 'react'

/** If a screen throws, show a plain message with a way back instead of a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.error(e)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6 text-center text-ink">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold">حدث خطأ غير متوقع / Something went wrong</h1>
          <p className="text-[14px] text-muted">
            لم يضِع عملك المحفوظ. أعد تحميل الصفحة، وإن تكرر الأمر أبلغ مسؤول النظام.
            <br />
            Your saved work is safe. Reload the page, and tell your administrator if it keeps happening.
          </p>
          <button className="h-10 rounded-md bg-nile px-5 text-white" onClick={() => (window.location.hash = '#/') && window.location.reload()}>
            إعادة التحميل / Reload
          </button>
        </div>
      </div>
    )
  }
}
