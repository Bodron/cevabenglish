import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import fs from 'fs'
import mime from 'mime-types'
import { v4 as uuidv4 } from 'uuid' // For generating unique file names
import dotenv from 'dotenv'

dotenv.config()

const bucketName = process.env.S3_BUCKET_NAME

const s3Client = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
})

/**
 * Uploads different types of data to AWS S3.
 *
 * @param {Buffer|string|File|Object} data - The data to upload (Buffer, base64, File object, or raw Object).
 * @param {string} [filename] - The filename or extension to use for the uploaded file.
 * @param {string} [mimeType] - The MIME type of the file.
 * @returns {string} The S3 file URL.
 */
const uploadToS3 = async (data, filename = '', mimeType = '') => {
  try {
    let buffer
    let contentType

    // Handle different input types
    if (Buffer.isBuffer(data)) {
      buffer = data
      contentType = mimeType || 'application/octet-stream' // Default MIME if not provided
    } else if (typeof data === 'string') {
      if (data.startsWith('data:')) {
        // Allow empty mime in data URI and parse base64 payload
        // Examples we support:
        // - data:image/png;base64,AAAA
        // - data:;base64,AAAA
        const re = /^data:(.*?);base64,(.*)$/
        const matches = data.match(re)
        if (!matches) throw new Error('Invalid base64 data format')
        let extractedMime = (matches[1] || '').trim()
        // Normalize mime like "imagejpeg" -> "image/jpeg"
        if (
          extractedMime &&
          !extractedMime.includes('/') &&
          extractedMime.toLowerCase().startsWith('image')
        ) {
          const subtype = extractedMime.slice(5) || 'jpeg'
          extractedMime = `image/${subtype}`
        }
        contentType = extractedMime || mimeType || 'application/octet-stream'
        buffer = Buffer.from(matches[2], 'base64')
      } else if (/^[A-Za-z0-9+/=\s]+$/.test(data.trim())) {
        // Looks like raw base64 string (no data: header)
        buffer = Buffer.from(data.replace(/\s+/g, ''), 'base64')
        contentType = mimeType || 'application/octet-stream'
      } else {
        // Fallback: treat as utf-8 text
        buffer = Buffer.from(data, 'utf-8')
        contentType = mimeType || 'text/plain'
      }
    } else if (data instanceof Object && data instanceof Blob) {
      buffer = Buffer.from(await data.arrayBuffer())
      contentType = mimeType || data.type || 'application/octet-stream'
    } else {
      throw new Error('Unsupported data type')
    }

    // Defensive fix: dacă pare imagine, dar header-ul nu e un JPEG valid,
    // căutăm markerul standard FFD8 și tăiem orice junk din față.
    if (
      String(contentType).startsWith('image/') &&
      buffer &&
      buffer.length > 8
    ) {
      const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]))
      if (soi > 0) {
        const originalMagic = buffer.slice(0, 4).toString('hex')
        buffer = buffer.slice(soi)
        const fixedMagic = buffer.slice(0, 4).toString('hex')
        console.log('[S3] Fixed image header', {
          before: originalMagic,
          after: fixedMagic,
          cut: soi,
        })
        // Dacă am găsit markerul JPEG, normalizăm contentType la image/jpeg
        contentType = 'image/jpeg'
      }
    }

    // Dacă primim un nume de fișier cu extensie (ex. "avatar.jpg"), o folosim direct.
    let extFromName = ''
    if (filename && typeof filename === 'string') {
      const dotIndex = filename.lastIndexOf('.')
      if (dotIndex !== -1 && dotIndex < filename.length - 1) {
        extFromName = filename.slice(dotIndex + 1)
      }
    }

    const fileExtension =
      extFromName ||
      mime.extension(contentType) ||
      (String(contentType).startsWith('image/') ? 'jpg' : 'bin')

    const newFilename = `${uuidv4()}-${Date.now()}.${fileExtension}` // Generate unique filename

    if (String(contentType).startsWith('image/')) {
      try {
        const magic = buffer.slice(0, 4).toString('hex')
        console.log('[S3] Upload image', {
          contentType,
          magic,
          size: buffer.length,
        })
      } catch {}
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: newFilename,
      Body: buffer,
      ACL: 'public-read',
      ContentType: contentType,
    })

    await s3Client.send(command)

    return `https://${bucketName}.s3.amazonaws.com/${newFilename}`
  } catch (error) {
    console.error('Error uploading to S3:', error)
    throw new Error('Upload failed')
  }
}
export default uploadToS3

/**
 * Deletes an object from S3 given a full https URL or a key.
 * Returns true if delete request was sent.
 */
export const deleteFromS3 = async (urlOrKey) => {
  try {
    if (!urlOrKey) return false
    let key = String(urlOrKey)
    if (key.startsWith('http')) {
      // Extract the part after the bucket domain
      const u = new URL(key)
      key = u.pathname.replace(/^\//, '')
    }
    if (!key) return false
    const cmd = new DeleteObjectCommand({ Bucket: bucketName, Key: key })
    await s3Client.send(cmd)
    return true
  } catch (err) {
    console.warn('S3 delete failed:', err?.message || err)
    return false
  }
}
