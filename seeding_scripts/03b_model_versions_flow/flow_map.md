# Flow 03: Model Publishing (Catalog Architecture)

> **Source Tables:** `AiModel`, `AiModelVersion`, `AiModelFeature`, `AiModelMetric`, `ModelAsset`, `Category`, `Modality`, `BodyPart`
> **Bot Script:** `03_model_publishing_flow/bot.js` (extends existing `seed_models_bot.js`)
> **Data Input:** `03_model_publishing_flow/data_input.json` — the consumable session queue
> **Data Reference:** `03_model_publishing_flow/data_reference.json` — immutable master model catalog
> **Reset Script:** `03_model_publishing_flow/reset.js`
> **Media Folder:** `seeding_scripts/data/MODELS/` — local images used as cover/gallery uploads

---

## Purpose
Simulate a verified developer publishing AI models to the marketplace.
This tests the full nested model creation: parent `AiModel` → child `AiModelVersion` →
`AiModelFeature[]`, `AiModelMetric[]`, `ModelAsset[]`.

> ⚠️ **Prerequisites:**
>   - Flow 00 must have seeded taxonomy (Categories, Modalities, BodyParts must exist in DB)
>   - Flow 02 must be APPROVED. Developer `isVerified` must be `true`.

---

## Actors
| Actor | Role | Action |
|---|---|---|
| `dev_01` | DEVELOPER (verified) | Publishes 4-5 AI models |
| `dev_02` | DEVELOPER (verified) | Publishes 4-5 AI models |

---

## Data Architecture

### Parent: `AiModel`
```
AiModel {
  title         String         — Descriptive marketing title
  category      String         — Denormalized category name (for fast display)
  categoryId    Int?           — FK → Category.id (relational filter)
  desc          String         — Full model description
  status        ModelStatus    — 'DRAFT' | 'PUBLISHED' | 'SUSPENDED' | 'ARCHIVED'
  galleryImages String[]       — Array of relative file paths (stored after upload)
  tags          String[]       — Free-text tags for discovery  e.g. ["FDA Cleared","3D","DICOM"]
  developerId   String         — FK → User.id (set server-side from JWT)

  // Counters — all start at 0, updated by business events:
  views         Int @default(0)
  sales         Int @default(0)
  totalStars    Int @default(0)
  starFrequency Int @default(0)
  reviewCount   Int @default(0)
}
```

### Child: `AiModelVersion`
One model can have multiple versions. Only ONE must have `isPrimary: true`.
```
AiModelVersion {
  version       String         — SemVer e.g. "1.0.0", "2.1.0"
  isActive      Boolean        — Controls marketplace visibility
  isPrimary     Boolean        — The featured/default version (exactly ONE per model)
  price         Int            — In cents (e.g. 29900 = $299.00) OR dollars depending on BE
  deliveryTime  Int            — Days until access is granted after payment
  modality      String?        — Denormalized (e.g. "MRI")
  modalityId    Int?           — FK → Modality.id
  bodyPart      String?        — Denormalized (e.g. "Brain")
  bodyPartId    Int?           — FK → BodyPart.id
  indications   String?        — Clinical use-case description
  fda           Boolean        — FDA cleared flag
  fdaUrl        String? @unique — Must be globally unique if provided
}
```

### Grandchildren (nested inside version):
```
AiModelFeature { feature: String }          — e.g. "Cloud Processing", "DICOM Integration"
AiModelMetric  { metric: String, value: Float, metricsUrl: String? } — e.g. Accuracy: 98.5
ModelAsset     { type: AssetType, encryptedValue: String }
  — AssetType: API_ENDPOINT | DOCKER_IMAGE | DOWNLOAD_LINK | LICENSE_KEY | HUGGINGFACE_URL
  — encryptedValue: the actual secret (API key, URL) — encrypted before storage
```

---

## Step-by-Step Journey

### STEP 1 — Login as Developer
Same as Flow 01 Step 3. Store `token` and `userId`.

### STEP 2 — Publish Model
**API:** `POST /api/aiModel` (multipart/form-data)
**Headers:** `Authorization: Bearer {dev_token}`

**Form fields:**
```
data    (JSON string)   — Model payload (see data_reference.json for full structure)
cover   (file)         — Cover image from data/MODELS/ directory
```

**JSON payload structure (`data` field):**
```json
{
  "title": "AiModel.title",
  "category": "AiModel.category  — must match an existing Category.name",
  "categoryId": "AiModel.categoryId — Category.id",
  "desc": "AiModel.desc",
  "status": "PUBLISHED",
  "tags": ["FDA Cleared", "DICOM", "3D"],
  "version": "1.0.0",
  "price": 299,
  "deliveryTime": 3,
  "modality": "MRI",
  "modalityId": 1,
  "bodyPart": "Brain",
  "bodyPartId": 1,
  "indications": "For use in adult neuroimaging workflows.",
  "fda": true,
  "fdaUrl": "https://fda.gov/510k/unique-identifier",
  "features": ["Cloud Processing", "DICOM Integration", "Sub-second inference"],
  "metrics": [
    { "metric": "Accuracy", "value": 98.5 },
    { "metric": "Sensitivity", "value": 96.2 },
    { "metric": "Specificity", "value": 99.1 }
  ],
  "assets": [
    { "type": "API_ENDPOINT", "value": "https://api.medai.com/v1/brain-mri" }
  ]
}
```

**Bot failure handling (from existing bot):**
- On failure: model added to `data_input.json` remainder (not removed)
- On success: model removed from `data_input.json` queue
- On 409/unique conflict: skip (not retried)
- On 5xx/timeout: retry up to `MAX_RETRIES` with exponential backoff

### STEP 3 — Verify Model in DB
After each successful POST, bot optionally queries `GET /api/aiModel/:id` to confirm:
- `status === 'PUBLISHED'`
- `versions[0].isPrimary === true`
- `versions[0].features.length > 0`
- `versions[0].metrics.length > 0`

---

## File Resolution Strategy (from existing bot)
```
1. Check data_input.json > model.files.cover for explicit filename
2. If found: look in data/MODELS/ directory for that file
3. If NOT found / directory empty: use DUMMY_PNG_BUFFER (1x1 transparent PNG)
```

---

## Reset Behaviour
`reset.js` runs (order matters — children before parents):
```js
await prisma.modelAsset.deleteMany({ where: { version: { aiModel: { developerId: { in: devIds } } } } });
await prisma.aiModelFeature.deleteMany({ ... });
await prisma.aiModelMetric.deleteMany({ ... });
await prisma.aiModelVersion.deleteMany({ where: { aiModel: { developerId: { in: devIds } } } });
await prisma.aiModel.deleteMany({ where: { developerId: { in: devIds } } });
// Copy data_reference.json → data_input.json to reset the queue
```

---

## Success Criteria
- [ ] Each developer has published ≥ 4 models
- [ ] Each model has exactly 1 version with `isPrimary: true`
- [ ] Each version has ≥ 1 feature, ≥ 1 metric
- [ ] `AiModel.status === 'PUBLISHED'`
- [ ] Cover image resolved and stored (path in `galleryImages[0]`)
- [ ] `AiModel.totalStars === 0`, `sales === 0` (counters start clean)
