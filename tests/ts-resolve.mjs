/**
 * 测试用的 ESM 解析钩子。
 *
 * 源码里对同目录模块使用了省略扩展名的写法（Vite 支持），也使用了 `@/` 路径别名，
 * Node 的原生 ESM 解析器两者都不认。与其让业务代码迁就测试工具，
 * 不如在测试侧补上解析规则。
 *
 * 注意：通过 `--import` 加载的文件，必须显式调用 module.register()
 * 才会真正注册解析钩子；仅仅导出 resolve() 是无效的。
 *
 * 用法：node --import ./tests/ts-resolve.mjs --test tests/*.test.ts
 */

import { register } from 'node:module'

// parentURL 必须是本文件自身的 URL，register 才能正确解析相对路径
register('./ts-resolve-hooks.mjs', import.meta.url)
