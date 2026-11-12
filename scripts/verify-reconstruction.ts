import { readFile, readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { record, list, str, strings, type RecordValue } from './reconstruct-catalog.ts'

export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const nonrules = new Set(['title', 'cover', 'back-cover', 'illustration', 'credits', 'blank', 'front-matter', 'service'])
export async function reviewedRecords(root: string, editionId: string) {
  const directory = resolve(root, 'reconstruction', editionId)
  const json = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as RecordValue
  const manifest = await json(resolve(directory, 'manifest.json'))
  const filenames = (await readdir(resolve(directory, 'authored'))).filter((f) => f.endsWith('.json')).sort()
  const records = await Promise.all(filenames.map(async (filename) => {
    const bytes = await readFile(resolve(directory, 'authored', filename))
    return { filename, checksum: digest(bytes), value: record(JSON.parse(bytes.toString('utf8'))) }
  }))
  const reviewFiles = (await readdir(resolve(directory, 'reviews'))).filter((f) => f.endsWith('.json')).sort()
  const reviews = await Promise.all(reviewFiles.map(async (filename) => ({ filename, value: await json(resolve(directory, 'reviews', filename)) })))
  const sources: RecordValue[] = await Promise.all(list(manifest.documents).map(async (document) => {
    const bytes = await readFile(resolve(root, str(document.path)))
    const checksum = digest(bytes)
    if (checksum !== document.sha256) throw new Error(`Original PDF changed: ${str(document.id)}`)
    return { ...document, sha256: checksum, filename: basename(str(document.path)), pages: document.expectedPages }
  }))
  const sections: RecordValue[] = records.flatMap(({ value }) => list(value.sections).map((section) => ({ ...section, source: str(value.document) })))
  const sectionMap = new Map(sections.map((section) => [str(section.id), section]))
  if (sectionMap.size !== sections.length) throw new Error('Duplicate independently authored section ID')
  const entries: RecordValue[] = [], seen = new Set<string>()
  for (const source of sources) {
    const document = str(source.id)
    for (let pageNumber = 1; pageNumber <= Number(source.pages); pageNumber++) {
      const candidates = records.flatMap((author) => str(author.value.document) === document ? list(author.value.pages)
        .filter((p) => p.pdfPage === pageNumber).map((page) => ({ author, page })) : [])
      if (candidates.length !== 1) throw new Error(`Expected one authored page: ${document}:${pageNumber}, found ${candidates.length}`)
      const { author, page } = candidates[0]!
      const inspection = record(page.visualInspection)
      if (inspection.status !== 'inspected' || inspection.agent !== author.value.author)
        throw new Error(`Original page was not visually inspected: ${document}:${pageNumber}`)
      if ((!Array.isArray(page.readingOrder) || !page.readingOrder.length)
          && !(nonrules.has(str(page.contentType)) && page.explicitExclusion))
        throw new Error(`Missing reading-order decisions: ${document}:${pageNumber}`)
      const sectionIds = strings(page.sectionIds)
      if (!sectionIds.length && !nonrules.has(str(page.contentType)))
        throw new Error(`Content page has no reconstructed output: ${document}:${pageNumber}`)
      for (const id of sectionIds) {
        const section = sectionMap.get(id)
        if (!section || section.source !== document || !Array.isArray(section.pages) || !section.pages.includes(pageNumber))
          throw new Error(`Invalid page/section link ${document}:${pageNumber}/${id}`)
      }
      const matches = reviews.flatMap((report) => {
        const review = report.value
        if (review.document !== document || review.reviewer === author.value.author || review.sourceSha256 !== source.sha256
          || basename(str(review.authorFile)) !== author.filename || review.authorFileSha256 !== author.checksum) return []
        return list(review.pages).filter((p) => p.pdfPage === pageNumber && p.status === 'verified'
          && sectionIds.every((id) => record(p.sectionHashes)[id] === digest(str(sectionMap.get(id)?.markdown))))
          .map((pageReview) => ({ report, pageReview }))
      })
      if (!matches.length) throw new Error(`Independent visual review is missing or stale: ${document}:${pageNumber}`)
      const match = matches[0]!
      entries.push({ document, documentTitle: source.title, pdfPage: pageNumber,
        printedPage: page.printedPage ?? null, contentType: page.contentType,
        files: sectionIds.map((id) => `content/${id}.md`), extractionStatus: page.extractionStatus,
        readingOrder: page.readingOrder, visualInspection: 'inspected', independentReview: 'verified',
        author: author.value.author, reviewer: match.report.value.reviewer,
        reviewFile: match.report.filename, issues: page.issues ?? [], sourceSha256: source.sha256,
        ...(sectionIds.length ? {} : { nonruleReason: page.explicitExclusion ?? page.readingOrder }),
      })
      seen.add(`${document}:${pageNumber}`)
    }
  }
  for (const { value: author } of records) for (const page of list(author.pages)) {
    if (!seen.has(`${str(author.document)}:${String(page.pdfPage)}`)) throw new Error('Out-of-range authored PDF page')
  }
  for (const section of sections) {
    for (const page of Array.isArray(section.pages) ? section.pages : []) {
      if (!entries.some((entry) => entry.document === section.source && entry.pdfPage === page && strings(entry.files).includes(`content/${str(section.id)}.md`)))
        throw new Error(`Unregistered source page in section ${str(section.id)}`)
    }
    for (const line of str(section.markdown).split('\n')) {
      if (/^#+\s*[\p{L}\p{N}]\s*$/u.test(line)) throw new Error(`Fragment heading in ${str(section.id)}`)
      if (line.includes('\ufffd')) throw new Error(`Unicode replacement in ${str(section.id)}`)
    }
  }
  const summary = Object.fromEntries(sources.map((source) => [str(source.id), {
    total: source.pages, processed: entries.filter((p) => p.document === source.id).length,
    visuallyInspected: entries.filter((p) => p.document === source.id).length,
    independentlyReviewed: entries.filter((p) => p.document === source.id).length,
  }]))
  return { records: records.map((r) => r.value), sections, sources, manifest,
    coverage: { schemaVersion: 2, edition: editionId, revision: manifest.revision,
      readyForIntegration: true, summary, pages: entries } }
}
