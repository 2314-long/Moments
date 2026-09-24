import { useEffect } from 'react'
import { bootstrapLibrary } from '@/persistence'

/**
 * 应用启动时同步存档。
 *
 * 这里刻意「不阻塞渲染」：libraryStore 在创建时就自带一份 demo 纪念册，
 * 因此首帧永远是完整的书架。存储层的加载结果稍后到齐后，
 * 由 bootstrapLibrary 决定是替换为真实存档还是把 demo 落盘。
 *
 * 这样做的好处：
 *  - 用户永远不会看到空白页或长时间的品牌启动动画；
 *  - 即使存储层完全不可用（隐私模式 / 受限渲染器），应用依然可用；
 *  - 无头环境或存储被禁用时也不会卡在加载态。
 */
export function LibraryBootstrap({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void bootstrapLibrary()
  }, [])

  return <>{children}</>
}
