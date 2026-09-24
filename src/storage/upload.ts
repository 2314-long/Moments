/** 读取图片尺寸 */
export function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = url
  })
}

export interface UploadedFile {
  file: File
  blob: Blob
  name: string
  previewUrl: string
  width: number
  height: number
}

/** HEIC 等浏览器无法直接解码的格式，退化为按文件名猜测尺寸 */
const FALLBACK_SIZE = { width: 1600, height: 1200 }

export async function inspectFile(file: File): Promise<UploadedFile> {
  const previewUrl = URL.createObjectURL(file)
  let size = FALLBACK_SIZE
  try {
    size = await readImageSize(previewUrl)
  } catch {
    /* 保持回退尺寸，后续渲染时会用 object-fit 兜住 */
  }
  return {
    file,
    blob: file,
    name: file.name,
    previewUrl,
    width: size.width,
    height: size.height,
  }
}

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/gif',
]

export const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif,.heic,.heif'

export function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return true
  // 有些系统对 HEIC 不给 mime type，只能看扩展名
  return /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name)
}

/** 生成一个「正在上传」用的占位渐变地址（无照片数据时） */
export function placeholderDataUrl(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360
  return `linear-gradient(135deg, hsl(${hash} 24% 62%), hsl(${(hash + 48) % 360} 28% 46%))`
}
