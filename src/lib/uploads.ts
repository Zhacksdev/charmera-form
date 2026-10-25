import { supabase, UPLOAD_BUCKET } from './supabase'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function validateImage(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'File harus berupa foto (JPG atau PNG).'
  if (file.size > MAX_UPLOAD_BYTES) return 'Ukuran foto maksimal 10 MB.'
  return null
}

function extensionFor(body: Blob) {
  if (body instanceof File) {
    const fromName = body.name.split('.').pop()
    if (fromName && fromName.length <= 5) return fromName.toLowerCase()
  }
  return body.type.split('/')[1] || 'bin'
}

export async function uploadOrderFile(orderCode: string, name: string, body: Blob) {
  const path = `${orderCode}/${name}.${extensionFor(body)}`
  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, body, { contentType: body.type || undefined, upsert: false })
  if (error) throw error
  return supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path).data.publicUrl
}
