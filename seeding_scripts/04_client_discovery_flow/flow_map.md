# Flow 04: Client Discovery (Search & Filter Testing)

> **Source Tables:** `AiModel`, `AiModelVersion`, `AiModelFeature`, `AiModelMetric`, `Category`, `Modality`, `BodyPart`
> **Bot Script:** `04_client_discovery_flow/bot.js`
> **Data Input:** `04_client_discovery_flow/data_input.json`
> **Data Reference:** `04_client_discovery_flow/data_reference.json`
> **Reset Script:** `04_client_discovery_flow/reset.js` (read-only flow — no DB reset needed)

---

## Purpose

Simulate a CLIENT browsing, searching, and filtering the marketplace.
This flow validates that our DB indexes and API query parameters work correctly
and return the right data for the frontend filters and search bar.

> ⚠️ **Prerequisite:** Flow 03 must have completed. ≥ 4 Published models must exist in DB.

---

## Actors

| Actor       | Role   | Action                                  |
| :---------- | :----- | :-------------------------------------- |
| `client_01` | CLIENT | Executes a battery of discovery queries |

---

## Indexed Fields Under Test

From `@@index()` declarations in schema:

```text
AiModel:
  @@index([developerId, status])   — filter by developer + published status
  @@index([title])                 — full-text title search
  @@index([category])              — category filter
  @@index([categoryId])            — relational category filter

AiModelVersion:
  @@index([aiModelId, isActive])   — only active versions surfaced
  @@index([modalityId])            — modality filter
  @@index([bodyPartId])            — body part filter
```

---

## Test Query Matrix

Each query is defined in `data_reference.json > queries[]` and run by the bot.

### QUERY 1 — Browse All Published Models

**API:** `GET /api/aiModel`
**Expected:** All models with `status: PUBLISHED`, paginated.
**Validation:** `response.data.models.length > 0`

### QUERY 2 — Filter by Category

**API:** `GET /api/aiModel?category=Medical Imaging`
**Expected:** Only models in "Medical Imaging" category.
**Validation:** All returned `model.category === 'Medical Imaging'`

### QUERY 3 — Filter by Tag

**API:** `GET /api/aiModel?tags=FDA Cleared`
**Expected:** Models with "FDA Cleared" in their `tags[]` array.
**Validation:** All returned models contain tag.

### QUERY 4 — Filter by Modality

**API:** `GET /api/aiModel?versions.modality=MRI`
**Expected:** Models that have at least one version with `modality: 'MRI'`
**Validation:** At least 1 result.

### QUERY 5 — Filter by Price Range

**API:** `GET /api/aiModel?versions.price=300&versions.priceRule=lte`
**Expected:** Models with price ≤ 300.
**Validation:** All returned versions have `price <= 300`.

### QUERY 6 — Filter by Feature

**API:** `GET /api/aiModel?versions.features.feature=DICOM Integration`
**Expected:** Models that include "DICOM Integration" feature.
**Validation:** At least 1 result, feature present.

### QUERY 7 — Filter by Metric

**API:** `GET /api/aiModel?versions.metrics.metric=Accuracy`
**Expected:** Models with "Accuracy" metric defined.
**Validation:** At least 1 result.

### QUERY 8 — Search by Title (Full-Text)

**API:** `GET /api/aiModel?search=Brain`
**Expected:** Models where title contains "Brain".
**Validation:** ≥ 1 result containing "Brain" in title.

### QUERY 9 — Fetch Taxonomy (Categories, Modalities, Tags)

**API:** `GET /api/taxonomy/categories`
**API:** `GET /api/taxonomy/filters`
**Expected:** Populated lists matching what was seeded in Flows 01-03.
**Validation:** `categories.length > 0`, `tags.length > 0`

### QUERY 10 — Fetch Single Model Detail

**API:** `GET /api/aiModel/:id`
**Expected:** Full model with nested `versions`, `versions.features`, `versions.metrics`, `developer` info.
**Validation:** All nested arrays populated.

---

## Reset Behaviour

This is a **read-only flow** — no data is written to the DB.
`reset.js` only clears the session state file (stored JWT tokens).

---

## Success Criteria

- [ ] All 10 queries return `HTTP 200`
- [ ] Filter queries return non-empty, correctly filtered results
- [ ] No query returns a `500` error (index failure)
- [ ] Full-text search returns relevant results
- [ ] Taxonomy endpoints return seeded categories, modalities, and tags
