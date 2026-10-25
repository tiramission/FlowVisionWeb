// 从图片文件头部解析原始尺寸（宽高），不做完整解码
// 对标原版 FlowVision 用 CGImageSource 读取元数据的方式
// 覆盖 PNG / GIF / BMP / WebP / JPEG / ICO / SVG；其余格式（如 AVIF）由
// 缩略图 <img> 的 onLoad 回填 naturalWidth/Height

export interface ImageSize {
  width: number
  height: number
}

/** 256KB 足以覆盖绝大多数 JPEG 的 EXIF + SOF 段 */
const HEAD_LIMIT = 262144

export async function readImageDimensions(file: Blob): Promise<ImageSize | null> {
  const head = await file.slice(0, HEAD_LIMIT).arrayBuffer()
  return parseImageHead(new DataView(head), new Uint8Array(head))
}

function parseImageHead(v: DataView, b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    if (v.getUint32(12) !== 0x49484452) return null // 'IHDR'
    return { width: v.getUint32(16), height: v.getUint32(20) }
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: v.getUint16(6, true), height: v.getUint16(8, true) }
  }
  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d) {
    return { width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) }
  }
  // WebP（RIFF 容器）
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return parseWebP(v, b)
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    return parseJpeg(v)
  }
  // ICO：reserved=0, type=1
  if (v.getUint16(0, true) === 0 && v.getUint16(2, true) === 1) {
    return { width: b[6] || 256, height: b[7] || 256 }
  }
  // SVG（文本，以 '<' 开头）
  if (b[0] === 0x3c) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(b.slice(0, 2048))
    return parseSvg(text)
  }
  return null
}

function parseWebP(v: DataView, b: Uint8Array): ImageSize | null {
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15])
  if (fourcc === 'VP8 ') {
    // 有损帧：帧标签(3B) + 起始码(3B) 后是各 14bit 的宽高
    return {
      width: v.getUint16(26, true) & 0x3fff,
      height: v.getUint16(28, true) & 0x3fff,
    }
  }
  if (fourcc === 'VP8L') {
    // signature(1B) 后 14bit width-1 / 14bit height-1
    const bits = v.getUint32(21, true)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    }
  }
  if (fourcc === 'VP8X') {
    // 扩展格式：flags(4B) 后是 24bit LE 的 canvas 宽-1 / 高-1
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    }
  }
  return null
}

function parseJpeg(v: DataView): ImageSize | null {
  let i = 2
  while (i + 9 < v.byteLength) {
    if (v.getUint8(i) !== 0xff) return null
    const marker = v.getUint8(i + 1)
    // 无长度的段
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const size = v.getUint16(i + 2)
    // SOF0~SOF15（除去 C4/DHT、C8/JPG、CC/DAC）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) }
    }
    i += 2 + size
  }
  return null
}

function parseSvg(text: string): ImageSize | null {
  const vb = /viewBox\s*=\s*["'][^"'\d]*[\d.:-]+[ ,]+[\d.:-]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(text)
  if (vb) return { width: +vb[1], height: +vb[2] }
  const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(text)
  const h = /\sheight\s*=\s*["']([\d.]+)/i.exec(text)
  if (w && h) return { width: +w[1], height: +h[1] }
  return null
}
