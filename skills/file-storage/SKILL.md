---
name: file-storage
description: "Trigger: file, archivo, upload, subir, imagen, PDF, imagen, storage, almacenamiento, S3, file system, multimedia, documento adjunto. Handle file uploads, storage, serving, and cleanup with Clean Architecture."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when implementing file upload, storage, serving, thumbnails, or file cleanup. Covers planos de artículos, radiografías, fotos de pacientes, documentos de alumnos — any file associated with a domain entity.

## Hard Rules

### File Storage Port (Application Layer)

```typescript
// application/ports/file-storage.port.ts
interface FileStoragePort {
  store(filename: string, content: Buffer, mimeType: string): Result<StoredFile, StorageError>
  retrieve(fileId: FileId): Result<Buffer, StorageError>
  delete(fileId: FileId): Result<void, StorageError>
  getUrl(fileId: FileId): Result<string, StorageError>
}

interface StoredFile {
  id: FileId
  originalName: string
  mimeType: string
  size: number
  path: string
  createdAt: Date
}
```

### File Entity (Domain)

```typescript
// domain/entities/file.ts
class File {
  private constructor(
    readonly id: FileId,
    readonly originalName: FileName,
    readonly mimeType: MimeType,
    readonly size: FileSize,
    readonly path: string,
    readonly entityType: EntityType,     // 'student', 'product', 'patient'
    readonly entityId: string,            // ID of the owning entity
    readonly createdAt: Date,
  ) {}

  static create(props: FileProps): Result<File, FileError> {
    // Validate mime type is allowed for this entity type
    // Validate file size limits
    // Sanitize filename
  }
}
```

### Non-Negotiable Rules

1. **NEVER store files as base64 in the database** — DB for metadata only. Files go to disk, S3, or equivalent. Store the `FileId` in the entity, not the content.
2. **Always use a storage port** — application code calls `FileStoragePort`. Local disk and S3 are both implementations of the same interface. Swap without touching business logic.
3. **Files are associated, not embedded** — an `Estudiante` has a `fotoPerfil: FileId`, not a `fotoPerfil: string`. The file exists independently and can be referenced by multiple entities if needed.
4. **Validate BEFORE storing** — check file type, size, and virus scan BEFORE writing. Never store first and validate later.
5. **Cleanup is a domain concern** — when an entity is deleted, its associated files MUST be marked for cleanup. Use a domain event (`FileReferenciaRemoved`) + handler that calls `FileStoragePort.delete()`.
6. **Serve files through a controller, never expose raw storage paths** — a controller resolves the FileId, checks permissions, and streams the file.

### File Type Validation

```typescript
// domain/value-objects/mime-type.ts
class MimeType {
  private constructor(private readonly value: string) {}

  static readonly ALLOWED_DOCS = ['application/pdf', 'image/jpeg', 'image/png']
  static readonly ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp']
  static readonly ALLOWED_CAD = ['application/dxf', 'application/pdf']

  static create(raw: string, allowedList: string[]): Result<MimeType, FileTypeError> {
    if (!allowedList.includes(raw)) {
      return err(new FileTypeError(`Tipo de archivo no permitido: ${raw}`))
    }
    return ok(new MimeType(raw))
  }
}
```

### Storage Structure

```
uploads/
  {entityType}/           # student/, product/, patient/
    {entityId}/           # uuid-of-the-entity/
      {fileId}.{ext}      # uuid-of-the-file.pdf
    thumbnails/           # auto-generated thumbnails
      {fileId}_thumb.{ext}
```

### Serving Files

```typescript
// presentation/controllers/file.controller.ts
class FileController {
  constructor(
    private readonly fileStorage: FileStoragePort,
    private readonly authPort: AuthPort,
  ) {}

  serve(req: Request, res: Response): void {
    const fileId = FileId.from(req.params.id)
    const identity = this.authPort.verify(req.token)

    if (identity.isErr()) return res.status(401).json(...)
    if (!this.canAccess(identity.value, fileId)) return res.status(403).json(...)

    const file = this.fileStorage.retrieve(fileId)
    if (file.isErr()) return res.status(404).json(...)

    res.setHeader('Content-Type', file.value.mimeType)
    res.send(file.value)
  }
}
```

### Decision Gates

| Situation | Action |
|-----------|--------|
| User uploads a file | Validate type + size → store via `FileStoragePort` → create `File` entity → associate with domain entity |
| Entity deleted | Emit domain event → handler calls `FileStoragePort.delete()` for all associated files |
| Need a thumbnail | Generate at upload time, store alongside original, serve via same controller with `?size=thumb` |
| Need a download URL | Generate a signed URL if cloud storage, or use controller. NEVER expose real path. |
| File types differ per entity | Define per-entity-type allowlists in domain config. Validate with `MimeType.create()`. |

### File Size Rules

- Validate BEFORE storing. Reject early.
- Limits configurable per entity type (radiografías pueden ser más grandes que fotos de perfil)
- Warn at 80% of limit, reject at 100%
- For large files (>10MB), use streams, never buffer entirely in memory

### Domain Mapping (cómo usar el mismo patrón en cada sistema)

| Sistema | Entity asociada | Tipos de archivo | Carpeta |
|---------|----------------|-----------------|---------|
| Colegios | `Estudiante`, `Curso` | Fotos, PDFs de documentos, autorizaciones | `student/{id}/` |
| Manufactura | `Articulo`, `OrdenProduccion` | **Planos CAD**, PDFs, imágenes de producto | `product/{id}/` |
| Odontología / Medicina general | `Paciente`, `Tratamiento` | **Radiografías**, fotos, escaneos, recetas | `patient/{id}/` |

El `File` entity, `FileStoragePort`, y los use cases son los MISMOS. Solo cambia el `entityType`.

### Security Rules

- Scan all uploads for malware (ClamAV or similar) — reject if infected
- Sanitize filenames: remove path traversal (`../`), special chars, limit length
- Set `Content-Disposition: attachment` for downloads, `inline` only for safe types (PDF, images)
- Rate-limit uploads per user/IP
- Never execute uploaded files. Never serve user-uploaded HTML/SVG (XSS risk).

## Execution Steps

1. Define `FileId`, `MimeType`, `FileSize`, `FileName` as Value Objects in domain.
2. Define `FileStoragePort` interface in application layer.
3. Implement `FileStoragePort` in infrastructure (local disk or S3 adapter).
4. Create `FileController` in presentation for upload and serve.
5. Create domain event for file cleanup on entity deletion.
6. Validate file type + size before storing.
7. Verify: storage can swap from disk to S3 without touching domain or application.

## Output Contract

Return: File entity and VOs, storage port interface, infrastructure implementation, upload/serve endpoints, file cleanup wiring, and verification of type/size validation.

## References

- `clean-arch/SKILL.md` — file logic in application, storage in infrastructure
- `value-objects/SKILL.md` — FileId, MimeType, FileSize, FileName as VOs
- `auth-access/SKILL.md` — file access permission checks
- `error-handling/SKILL.md` — StorageError, FileTypeError patterns
