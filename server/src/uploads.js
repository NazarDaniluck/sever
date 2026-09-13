import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { uploadsDir } from './db.js'

// Загрузка файлов с безопасной проверкой содержимого.
// Проблема, которую решает модуль: имя файла и расширение раньше брались из
// originalname клиента, а /uploads отдавался статикой -> загрузка x.html/svg
// (mimetype подделывается одной строкой) давала хранимый XSS.
// Теперь: 1) имя-временное, 2) после записи читаются только первые 16 байт
// (magic bytes) и расширение всегда назначается сервером по факту содержимого,
// 3) опасные расширения отклоняются до записи на диск.
// Плюс щадящий режим для слабого HDD: все записи идут через общий семафор,
// чтобы несколько одновременных загрузок не заставляли головку диска метаться
// между потоками (это сильно замедляет механический диск).

export class UploadError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UploadError'
    this.status = 400
    this.expose = true
  }
}

// Ранний отсев очевидных опасных имён (не даём зря писать на диск).
const DANGEROUS_EXT = /\.(html?|xhtml|svg|js|mjs|php|asp|aspx|jsp|cgi|shtml|xml|swf|exe|com|dll|bat|cmd|vbs|wsf|jar|sh|pl|py|class)$/i

// Типы, определяемые по magic-байтам. kind + расширение всегда серверные.
const TYPES = {
  png:  { kind: 'image',    ext: '.png',  mime: 'image/png' },
  jpeg: { kind: 'image',    ext: '.jpg',  mime: 'image/jpeg' },
  gif:  { kind: 'image',    ext: '.gif',  mime: 'image/gif' },
  webp: { kind: 'image',    ext: '.webp', mime: 'image/webp' },
  bmp:  { kind: 'image',    ext: '.bmp',  mime: 'image/bmp' },
  mp4:  { kind: 'video',    ext: '.mp4',  mime: 'video/mp4' },
  webm: { kind: 'video',    ext: '.webm', mime: 'video/webm' },
  ogg:  { kind: 'video',    ext: '.ogg',  mime: 'video/ogg' },
  mp3:  { kind: 'audio',    ext: '.mp3',  mime: 'audio/mpeg' },
  flac: { kind: 'audio',    ext: '.flac', mime: 'audio/flac' },
  pdf:  { kind: 'document', ext: '.pdf',  mime: 'application/pdf' },
  zip:  { kind: 'document', ext: '.zip',  mime: 'application/zip' },
  rar:  { kind: 'document', ext: '.rar',  mime: 'application/vnd.rar' }
}

// Текстовые документы без magic-байтов: разрешаем по расширению — их
// Content-Type (text/plain, text/markdown, application/json) не исполняется.
const TEXT_EXT = { '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json' }

function sniff(buf) {
  if (buf.length < 4) return null
  const s4 = buf.toString('latin1', 0, 4)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return TYPES.png
  if (buf[0] === 0xff && buf[1] === 0xd8) return TYPES.jpeg
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return TYPES.gif
  if (s4 === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return TYPES.webp
  if (buf[0] === 0x42 && buf[1] === 0x4d) return TYPES.bmp
  if (buf.toString('latin1', 0, 3) === 'ID3') return TYPES.mp3
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return TYPES.mp3
  if (s4 === 'fLaC') return TYPES.flac
  if (s4 === 'OggS') return TYPES.ogg
  if (buf.toString('latin1', 4, 8) === 'ftyp') return TYPES.mp4   // контейнер MP4 (mp4/m4a)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return TYPES.webm // mkv/webm
  if (s4 === '%PDF') return TYPES.pdf
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return TYPES.zip
  if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) return TYPES.rar
  if (buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf) return TYPES.zip // 7z
  return null
}

// ---------- Щадящий режим записи на HDD ----------
// Параллельные потоки записи на механический диск заставляют головку постоянно
// позиционироваться, из-за чего общая скорость падает многократно. Поэтому все
// файлы пишутся через общий семафор: одновременно на диск попадает максимум
// MAX_CONCURRENT_WRITES потоков, остальные запросы «придерживаются» за счёт
// backpressure — сокет клиента не читается, и его данные копятся в буфере TCP,
// а не рвутся на диск. (Можно поставить 1 для полной последовательной записи.)
const MAX_CONCURRENT_WRITES = 2
const MAX_CONCURRENT_UPLOADS = 8
let activeWrites = 0
const writeQueue = []
function acquireWriteSlot() {
  if (activeWrites < MAX_CONCURRENT_WRITES) { activeWrites++; return Promise.resolve() }
  return new Promise(res => writeQueue.push(res))
}
function releaseWriteSlot() {
  activeWrites--
  if (writeQueue.length) { activeWrites++; writeQueue.shift()() }
}

// Собственный storage вместо multer.diskStorage: пишет потоком в /uploads,
// удерживая «слот» диска на всё время записи, и рано обрывает запись при
// превышении лимита (иначе переразмеренный файл записался бы на диск целиком).
function hddStorage({ maxSize }) {
  return {
    _handleFile(req, file, cb) {
      const tmp = path.join(uploadsDir, crypto.randomBytes(16).toString('hex'))
      const out = fs.createWriteStream(tmp)
      let released = false, done = false, bytes = 0
      const release = () => { if (!released) { released = true; releaseWriteSlot() } }
      const fail = (err) => {
        if (done) return
        done = true
        if (file.stream.readable) file.stream.destroy()
        try { out.destroy() } catch { /* ignore */ }
        try { fs.unlinkSync(tmp) } catch { /* ignore */ }
        release()
        cb(err)
      }
      const finish = () => {
        if (done) return
        done = true
        release()
        cb(null, { filename: path.basename(tmp), size: bytes })
      }
      acquireWriteSlot().then(() => {
        if (!file.stream.readable) return fail(new Error('Загрузка прервана'))
        file.stream.on('data', (chunk) => {
          bytes += chunk.length
          if (maxSize && bytes > maxSize) fail(new multer.MulterError('LIMIT_FILE_SIZE', file.fieldname))
        })
        file.stream.on('error', () => fail(new Error('Загрузка прервана')))
        file.stream.on('aborted', () => fail(new Error('Загрузка прервана')))
        out.on('error', () => fail(new Error('Ошибка записи на диск')))
        out.on('finish', finish)
        file.stream.pipe(out)
      })
    },
    _removeFile(req, file, cb) {
      fs.unlink(path.join(uploadsDir, file.filename), () => cb && cb(null))
    }
  }
}

// Ограничение одновременных загрузок: при перегрузке сразу отвечаем 429, а не
// копим длинные очереди открытых сокетов на слабом сервере.
let activeUploads = 0
function limitConcurrentUploads(req, res, next) {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    return res.status(429).json({ error: 'Сервер занят загрузками файлов, попробуйте через минуту' })
  }
  activeUploads++
  res.on('close', () => { activeUploads-- })
  next()
}

export function createUploader({ maxSize, maxFiles }) {
  const limits = { fileSize: maxSize || 50 * 1024 * 1024 }
  if (maxFiles) limits.files = maxFiles
  const m = multer({
    storage: hddStorage({ maxSize: limits.fileSize }),
    limits,
    fileFilter: (req, file, cb) => (DANGEROUS_EXT.test(file.originalname)
      ? cb(new UploadError('Неподдерживаемый тип файла'))
      : cb(null, true))
  })
  // Каждый загружающий middleware предваряем лимитом одновременных загрузок.
  // Возвращаем массив — Express сам разворачивает middleware в цепочку.
  for (const k of ['single', 'array', 'fields']) {
    const orig = m[k].bind(m)
    m[k] = (...args) => [limitConcurrentUploads, orig(...args)]
  }
  return m
}

// Назначает каждому файлу безопасное расширение по содержимому. Кидает UploadError.
function finalizeFiles(files, allowed) {
  const done = []
  try {
    for (const f of files || []) {
      const tmp = path.join(uploadsDir, f.filename)
      let type = null
      try {
        const fd = fs.openSync(tmp, 'r')
        const buf = Buffer.alloc(16)
        fs.readSync(fd, buf, 0, 16, 0)
        fs.closeSync(fd)
        type = sniff(buf)
      } catch { type = null }
      let ext, mime
      if (type) {
        if (!allowed.includes(type.kind)) {
          throw new UploadError(`Неподдерживаемый тип файла: ${f.originalname || 'файл'}`)
        }
        ext = type.ext; mime = type.mime; f.kind = type.kind
      } else {
        const e = path.extname(f.originalname || '').toLowerCase()
        if (!TEXT_EXT[e] || !allowed.includes('document')) {
          throw new UploadError(`Неподдерживаемый тип файла: ${f.originalname || 'файл'}`)
        }
        ext = e; mime = TEXT_EXT[e]; f.kind = 'document'
      }
      const finalName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
      fs.renameSync(tmp, path.join(uploadsDir, finalName))  // rename в той же папке — без копирования данных
      f.filename = finalName
      done.push(path.join(uploadsDir, finalName))
    }
  } catch (err) {
    for (const p of done) { try { fs.unlinkSync(p) } catch { /* ignore */ } }
    throw err
  }
}

// Middleware после multer: безопасно финализирует req.file/req.files.
export function validateFiles(kinds = ['image', 'video', 'audio', 'document']) {
  return (req, res, next) => {
    let files = []
    if (req.file) files = [req.file]
    else if (req.files) files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat()
    if (!files.length) return next()
    try {
      finalizeFiles(files, kinds)
      next()
    } catch (err) { next(err) }
  }
}

// Переопределить kind и расширение уже сохранённого файла (контейнер MP4 в аудио -> .m4a).
export function renameAs(file, kind, ext) {
  const old = path.join(uploadsDir, file.filename)
  const finalName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
  fs.renameSync(old, path.join(uploadsDir, finalName))
  file.filename = finalName
  file.kind = kind
}
