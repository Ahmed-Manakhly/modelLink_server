# Flow 03b — Model Versions

> **Source Tables:** `AiModelVersion`, `AiModelFeature`, `AiModelMetric`, `ModelAsset`  
> **Bot Script:** `03b_model_versions_flow/bot.js`  
> **Data Input:** `03b_model_versions_flow/data_input.json`  
> **Data Reference:** `03b_model_versions_flow/data_reference.json`  
> **Reset Script:** `03b_model_versions_flow/reset.js`  

---

## Purpose

Simulate developers publishing additional, secondary versions to their already existing AI models. This flow demonstrates how a single `AiModel` parent can hold multiple `AiModelVersion` children with varying prices, version tags (e.g., v2.0.0), specific features, metrics, and deliverable assets.

> [!IMPORTANT]
> **Prerequisites**:
>
> - Flow 03 must have completed successfully. The developers must already have published models (`AiModel`) in the database.
> - Developers must be verified (`isVerified = true`).

---

## Actors

| Actor    | Role                 | Action                                                        |
| :------- | :------------------- | :------------------------------------------------------------ |
| `dev_01` | DEVELOPER (verified) | Adds a new secondary version to their first published model.  |
| `dev_02` | DEVELOPER (verified) | Adds a new secondary version to their first published model.  |
| `dev_03` | DEVELOPER (verified) | Adds a new secondary version to their first published model.  |

---

## Step-by-Step Journey

### STEP 1 — Fetch Existing Models

**API:** `GET /api/aiModel/byUser/{userId}`

**Headers:** `Authorization: Bearer {dev_token}`

**Action:** The bot retrieves the list of the developer's models and selects the first one to receive a new version.

### STEP 2 — Create New Version

**API:** `POST /api/aiModel/{modelId}/versions`

**Headers:** `Authorization: Bearer {dev_token}`

**Payload:**

```json
{
  "version": "2.x.0",
  "price": 250,
  "isPrimary": false,
  "isActive": true
}
```

*(Note: The price increments dynamically based on the number of existing versions: `250 + existingCount * 50`).*

**Expected DB side-effects:**

- A new `AiModelVersion` child record is attached to the parent `AiModel`.

### STEP 3 — Populate Version Metadata (Features, Metrics, Assets)

The bot executes sequential calls targeting the newly created `versionId`:

#### Add Features

**API:** `POST /api/aiModel/versions/{versionId}/features`

```json
{ "feature": "Advanced Integration for 2.x.0" }
```

#### Add Metric

**API:** `POST /api/aiModel/versions/{versionId}/metrics`

```json
{ "metric": "Accuracy (v2)", "value": 98.5 }
```

#### Add Asset

**API:** `POST /api/aiModel/versions/{versionId}/assets`

```json
{ "type": "API_ENDPOINT", "value": "https://api.medai-seed.com/v2/endpoint-{versionId}" }
```

**Expected DB side-effects:**

- Corresponding `AiModelFeature`, `AiModelMetric`, and `ModelAsset` records are created and linked specifically to the new `AiModelVersion`.

---

## Reset Behaviour

`reset.js` identifies the specific secondary versions created during this flow (by matching the `2.x.0` string signature or by wiping non-primary versions attached to the seeded developers) and deletes them. Due to Prisma's `onDelete: Cascade` rules, deleting the `AiModelVersion` automatically cleans up its associated features, metrics, and assets.
