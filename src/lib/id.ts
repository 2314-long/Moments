import { nanoid } from 'nanoid'

/** 生成带前缀的短 id，便于调试时一眼看出类型 */
export function createId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`
}

export const newAlbumId = () => createId('alb')
export const newPageId = () => createId('pg')
export const newElementId = () => createId('el')
export const newPhotoId = () => createId('ph')
export const newAssetKey = () => createId('asset')
