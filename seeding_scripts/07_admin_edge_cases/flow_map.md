# Flow 07 — Admin Edge Cases

> **Source Tables:** `AiModel`  
> **Bot Script:** `07_admin_edge_cases/bot.js`  

---

## Purpose

Simulates an Admin user exercising moderation powers over published models, verifying that soft-delete ("suspend") mechanisms successfully hide models from the public catalog, and that they can be restored.

This ensures edge cases like DMCA takedowns, quality violations, and admin-featured flags work securely without destroying referential ledger data.

---

## Actors

| Actor   | Role  | Action                                        |
| :------ | :---- | :-------------------------------------------- |
| `admin` | ADMIN | Suspends, restores, and features AI models.   |

---

## Step-by-Step Journey

### Scenario A — Soft-Delete Model

**API:** `DELETE /api/aiModel/:id`

**Headers:** `Authorization: Bearer {admin_token}`

**Action:** The Admin issues a delete request for a specific model.

**Expected DB side-effects:**

- `AiModel` status updates to `SUSPENDED` (or similar soft-delete state).
- The model will no longer appear in public searches or allow new checkout intents.

---

### Scenario B — Restore Model

**API:** `PATCH /api/aiModel/:id`

**Headers:** `Authorization: Bearer {admin_token}`

**Payload:**

```json
{
  "restore": true
}
```

**Action:** The Admin restores the suspended model.

**Expected DB side-effects:**

- `AiModel` status updates back to `PUBLISHED`.
- The model becomes visible in the catalog again.

---

### Scenario C — Bulk Feature Models

**API:** `PATCH /api/aiModel/bulk-status`

**Headers:** `Authorization: Bearer {admin_token}`

**Payload:**

```json
{
  "ids": ["model_id_1", "model_id_2"],
  "featured": true
}
```

**Action:** The Admin features specific models to appear on the marketplace homepage.

**Expected DB side-effects:**

- The specified `AiModel` records have their `isFeatured` flag set to `true`.
