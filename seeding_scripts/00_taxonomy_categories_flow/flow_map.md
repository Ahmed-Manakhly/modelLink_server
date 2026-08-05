# Flow 00: Taxonomy & Categories Seeding

> **Source Tables:** `Category`, `Modality`, `BodyPart`
> **Bot Script:** `00_taxonomy_categories_flow/bot.js`
> **Data Input:** `00_taxonomy_categories_flow/data_input.json` (consumable, wiped on reset)
> **Data Reference:** `00_taxonomy_categories_flow/data_reference.json` (immutable master copy)
> **Reset Script:** `00_taxonomy_categories_flow/reset.js`
> **Media Folder:** `seeding_scripts/data/CATEGORIES/` — category images copied to `public/assets/` during seeding

---

## Purpose

Seed the master taxonomy that ALL other flows depend on. No model can be published without existing categories, modalities, and body parts. This flow must run first.

---

## Prerequisites

- Flow 01 must have completed successfully. Admin account `admin@modelLink.com` must exist in DB.
- Server must be running (for API calls + file copy).

---

## Actors

| Actor   | Role  | Credential Source         |
| :------ | :---- | :------------------------ |
| `admin` | ADMIN | `data_input.json > admin` |

---

## Step-by-Step Journey

### STEP 1 — Admin Login

**API:** `POST /api/auth/login`

**Payload:**

```json
{
  "email": "admin@modelLink.com",
  "password": "A@1234567891a"
}
```

**Expected response:** JWT token for subsequent admin-only requests.

---

**API:** `POST /api/taxonomy/categories` (admin-only)
**Payload:**

```json
{
  "name": "Medical Imaging",
  "slug": "medical-imaging"
}
```

**Expected DB side-effects:**

- `Category` record created with `name`, `slug`, `parentId: null`
- Image copied from `seeding_scripts/data/CATEGORIES/Medical_Imaging.png` to `public/assets/Medical_Imaging.png`

**Subcategories:** For each subcategory, POST again with `parentId` set to the parent category ID:

```json
{
  "name": "X-ray Analysis",
  "slug": "x-ray-analysis",
  "parentId": 1
}
```

---

## Seed Categories (with Subcategories)

The endpoint creates top-level categories or child subcategories.

### STEP 3 — Seed Modalities

**API:** `POST /api/taxonomy/modalities` (admin-only)
**Payload:**

```json
{
  "name": "MRI",
  "slug": "mri"
}
```

---

### STEP 4 — Seed Body Parts

**API:** `POST /api/taxonomy/bodyparts` (admin-only)
**Payload:**

```json
{
  "name": "Brain",
  "slug": "brain"
}
```

---

## Image Resolution Strategy

```text
1. Read category.image filename from data_reference.json
2. Look in seeding_scripts/data/CATEGORIES/ for that file
3. Copy to server public/assets/ (so FE can request /assets/Medical_Imaging.png)
4. If not found: skip copy, log warning (category still created)
```

---

## Reset Behaviour

`reset.js` runs:

```js
await prisma.bodyPart.deleteMany({});
await prisma.modality.deleteMany({});
await prisma.category.deleteMany({}); // cascade removes subcategories
// Remove copied images from public/assets/
```

---

## Success Criteria

- [ ] All 5 parent categories exist in DB
- [ ] All 15 subcategories exist with correct `parentId`
- [ ] All 5 modalities exist
- [ ] All 6 body parts exist
- [ ] Category images copied to `public/assets/`
- [ ] Admin token acquired successfully
- [ ] No duplicate slug/name errors (skipped if exists)

---

## Dependencies

- **Flow 01** (Auth): Must exist before this flow (admin account required)
- **Flow 03** (Model Publishing): Must run AFTER this flow (models reference categories)

---

## Integration Points

- `Categories.js` renders categories (currently static, planned dynamic)
- `Topbar.js` category dropdown (planned dynamic)
- `Controls.js` filter dropdown (planned dynamic)
- `FormActions.js` category select (must match seeded categories)
