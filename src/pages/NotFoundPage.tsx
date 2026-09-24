import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-ink-700 bg-ink-850/60">
        <BookOpen className="h-6 w-6 text-ink-400" />
      </div>
      <div>
        <h1 className="font-serif text-lg text-ink-100">这一页还没有被写下</h1>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink-500">
          你要找的纪念册或页面不存在，也可能已经被删除了。
        </p>
      </div>
      <Link to="/" className="btn-primary">
        <ArrowLeft className="h-4 w-4" />
        返回我的书架
      </Link>
    </div>
  )
}
