---
name: reporting-documents
description: "Trigger: report, PDF, boletin, boletín, factura, recibo, documento, odontograma, certificado, pdf generation, reporte, planilla, remito. Generate structured documents (PDFs, spreadsheets) with templates and data aggregation."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when generating documents — report cards (boletines), invoices, odontograms, certificates, production orders, or any structured printable output. Separates data preparation from document rendering.

## Hard Rules

### Three-Layer Document Generation

```
1. DATA AGGREGATION  → Application layer (use case)
2. TEMPLATE + RENDER → Infrastructure (PDF library, HTML/CSS, spreadsheet)
3. OUTPUT + STORAGE  → Infrastructure (file-storage port, email)
```

### Document Port (Application Layer)

```typescript
// application/ports/document-renderer.port.ts
interface DocumentRendererPort {
  render(template: TemplateRef, data: Record<string, unknown>): Result<DocumentOutput, DocumentError>
}

interface DocumentOutput {
  content: Buffer
  format: DocumentFormat  // PDF, XLSX, DOCX
  fileName: string
  mimeType: string
}
```

### Template Abstraction

```typescript
// Templates are referenced by name, resolved by infrastructure
type TemplateRef = {
  name: string           // 'boletin-notas', 'factura-a', 'odontograma-simple'
  version?: string       // For template migrations
}
```

### Non-Negotiable Rules

1. **Data preparation is SEPARATE from rendering** — the use case collects and formats data. The renderer only receives `Record<string, unknown>` and transforms it to output. NEVER mix DB queries with PDF generation.
2. **Templates are NOT in application code** — HTML templates, PDF layouts, Excel templates are infrastructure assets. Application only references them by name.
3. **Documents are generated ASYNC for anything complex** — if generation takes >2s, queue it. Return a `DocumentJobId` immediately, notify when ready.
4. **Generated documents go through `file-storage`** — once rendered, store via `FileStoragePort`. The document IS a file. Attach the `FileId` to the entity (factura tiene un `pdfFileId`).
5. **One use case = one document type** — `GenerateBoletinUseCase`, `GenerateFacturaUseCase`. Each knows exactly what data to gather and which template to use.

### Use Case Pattern (domain-agnostic)

```typescript
class GenerateDocumentUseCase {
  constructor(
    private readonly dataRepo: DataRepository,
    private readonly renderer: DocumentRendererPort,
    private readonly fileStorage: FileStoragePort,
  ) {}

  execute(entityId: EntityId, context: ReportContext): Result<FileId, ApplicationError> {
    // 1. Gather data (application layer — knows the domain)
    const entity = this.dataRepo.findById(entityId)
    if (entity.isErr()) return err(new NotFoundError('Entidad no encontrada'))

    const records = this.dataRepo.findRecords(entityId, context)
    const data = {
      entityName: entity.value.name,
      contextLabel: context.label,
      records: records.value.map(r => ({
        label: r.label,
        value: r.value,
        status: r.status,
      })),
      summary: calculateSummary(records.value),
    }

    // 2. Render (infrastructure — template + PDF library)
    const doc = this.renderer.render({ name: context.templateName }, data)
    if (doc.isErr()) return err(new DocumentError('Error al generar documento'))

    // 3. Store as file (infrastructure — file-storage)
    const fileName = `${context.templateName}-${entityId}-${context.period}.pdf`
    const stored = this.fileStorage.store(fileName, doc.value.content, doc.value.mimeType)
    if (stored.isErr()) return err(new StorageError('Error al guardar documento'))

    // 4. Return file ID for download/view
    return ok(stored.value.id)
  }
}

// The same pattern works for:
// - Colegios:   GenerateDocumentUseCase(alumnoId, { templateName: 'boletin-notas', period: '2026-Q1' })
// - Facturación: GenerateDocumentUseCase(clienteId, { templateName: 'factura-a', period: '2026-05' })
// - Odontología: GenerateDocumentUseCase(pacienteId, { templateName: 'odontograma', period: '2026-05-13' })
// - Medicina:   GenerateDocumentUseCase(pacienteId, { templateName: 'receta', period: '2026-05-13' })
```

### Document Format Rules

| Format | Use Case | Library (infrastructure) |
|--------|----------|--------------------------|
| PDF | Boletines, facturas, certificados, recetas, odontogramas | Puppeteer/Playwright (HTML→PDF) or PDFKit |
| XLSX | Planillas de notas, reportes de stock | ExcelJS or similar |
| HTML | Boletín vista previa, factura online | Template engine (Handlebars, EJS) |
| Images | Odontogramas exportados | Canvas/SVG renderer |

**Prefer HTML → PDF over raw PDF libraries** — templates are maintainable HTML/CSS, easier to version, and designers can work on them.

### Template Organization

```
infrastructure/
  templates/
    boletin-notas/         # Ejemplo: notas escolar
    factura-a/             # Ejemplo: factura de venta
    odontograma-simple/    # Ejemplo: odontograma
    receta-medica/         # Ejemplo: receta de medicina general
    presupuesto/           # Ejemplo: presupuesto de manufactura
    certificado/           # Ejemplo: certificado de alumno / trabajo / salud
```

### Async Generation Pattern (for complex documents)

```typescript
class QueueDocumentGenerationUseCase {
  execute(type: DocumentType, entityId: string): Result<DocumentJobId, ApplicationError> {
    const job = this.jobQueue.enqueue({ type, entityId })
    return ok(job.id)
  }
}

// Job processor (background worker)
class DocumentJobProcessor {
  async handle(job: DocumentJob): Promise<void> {
    const useCase = this.resolveUseCase(job.type)
    const result = await useCase.execute(job.entityId)
    // Store result, notify via messaging/websocket
  }
}
```

### Decision Gates

| Situation | Action |
|-----------|--------|
| Simple document (<2s gen) | Synchronous: render + store + return FileId |
| Complex document (boletín con muchas materias) | Queue async job, notify when ready |
| New document type | Create use case (data prep) + template (render) |
| Template change | Update `.hbs` file in infrastructure. No code changes. |
| Multi-language document | Pass locale in data, use i18n in template |
| Batch generation (boletines de todo un curso) | Queue per-student jobs, track progress |

### Data Formatting Rules

- Format data in the USE CASE, not the template. Templates are dumb — they receive ready-to-display values.
- Dates come pre-formatted: `{ label: 'Período', value: 'Marzo 2026' }`
- Numbers come pre-formatted: `{ label: 'Total', value: '$ 45.230,00' }`
- Booleans come pre-resolved: `{ label: 'Estado', value: 'APROBADO' }`
- Never pass raw domain objects to templates. Always map to display DTOs.

## Execution Steps

1. Define the document type and its data requirements.
2. Create the use case: gather data from repositories, format for display.
3. Create the HTML template in `infrastructure/templates/`.
4. Implement the renderer adapter (HTML→PDF via Puppeteer, etc.).
5. Wire the document through `file-storage` for persistence.
6. Add download/print endpoint in presentation that serves the stored file.
7. Verify: template change requires no application code change. Data format is independent of renderer choice.

## Output Contract

Return: use case, template, renderer adapter, file storage integration, and verification that swapping renderer (PDF→HTML) requires no data changes.

## References

- `file-storage/SKILL.md` — documents ARE files, store via FileStoragePort
- `clean-arch/SKILL.md` — use cases in application, templates in infrastructure
- `error-handling/SKILL.md` — DocumentError, StorageError patterns
- `messaging-notifications/SKILL.md` — notify users when async document is ready
