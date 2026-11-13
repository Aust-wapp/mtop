import sharp from "sharp"

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
const MAX_SIGNATURE_WIDTH = 3000
const MAX_SIGNATURE_HEIGHT = 1000

export interface PreparedSignatureImage {
  bytes: Uint8Array
  extension: "png" | "webp"
  contentType: "image/png" | "image/webp"
}

/**
 * Validate the image itself rather than trusting the filename or MIME type.
 * JPEG input is converted to WebP so the private signature bucket can keep
 * its existing PNG/WebP-only restriction and previously issued paths unchanged.
 */
export async function prepareOfficialSignature(file: File): Promise<PreparedSignatureImage> {
  if (file.size === 0 || file.size > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature must be a nonempty image under 2 MB.")
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const png = bytes.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const webp = bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  const jpeg = bytes.length > 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

  const format = png ? "png" : webp ? "webp" : jpeg ? "jpeg" : null
  const mimeType = format === "jpeg" ? "image/jpeg" : format ? `image/${format}` : null
  if (!format || (file.type && file.type !== mimeType)) {
    throw new Error("Use a valid PNG, JPG/JPEG, or WebP signature image.")
  }

  try {
    const image = sharp(Buffer.from(bytes), { limitInputPixels: 3_000_000 })
    const metadata = await image.metadata()
    if (metadata.format !== format ||
        !metadata.width || !metadata.height ||
        metadata.width > MAX_SIGNATURE_WIDTH ||
        metadata.height > MAX_SIGNATURE_HEIGHT ||
        (metadata.pages ?? 1) !== 1) {
      throw new Error("Signature image dimensions or contents are invalid. Maximum: 3000 × 1000 pixels.")
    }
    await image.stats()

    if (format === "jpeg") {
      const converted = await image.webp({ quality: 90, effort: 4 }).toBuffer()
      if (converted.length > MAX_SIGNATURE_BYTES) {
        throw new Error("Converted signature exceeds 2 MB. Choose a smaller image.")
      }
      return { bytes: new Uint8Array(converted), extension: "webp", contentType: "image/webp" }
    }

    return {
      bytes,
      extension: format,
      contentType: format === "png" ? "image/png" : "image/webp",
    }
  } catch (error) {
    if (error instanceof Error &&
        (error.message.startsWith("Signature image dimensions") ||
         error.message.startsWith("Converted signature exceeds"))) {
      throw error
    }
    throw new Error("Signature image cannot be decoded.")
  }
}
