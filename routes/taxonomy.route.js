const router = require("express").Router();
const authController = require("../controller/auth.controller");
const taxonomyController = require("../controller/taxonomy.controller");

// Public GET routes
router.get("/categories", taxonomyController.getAllCategories);
router.get("/modalities", taxonomyController.getAllModalities);
router.get("/bodyparts", taxonomyController.getAllBodyParts);
router.get("/tags", taxonomyController.searchTags);
router.get("/features", taxonomyController.searchFeatures);
router.get("/metrics", taxonomyController.searchMetrics);

// Protected routes
router.use(authController.protect, authController.restrictTo("ADMIN", "EMPLOYEE"));

router.get("/categories/manage", taxonomyController.getCategoriesManage);
router.get("/categories/:id/impact", taxonomyController.getCategoryImpact);

// Categories (multipart: data JSON + optional icon file)
router.post("/categories", taxonomyController.uploadCategoryIcon, taxonomyController.createCategory);
router.patch("/categories/:id", taxonomyController.uploadCategoryIcon, taxonomyController.updateCategory);
router.delete("/categories/:id", taxonomyController.deleteCategory);

router.get("/modalities/manage", taxonomyController.getModalitiesManage);
router.get("/modalities/:id/impact", taxonomyController.getModalityImpact);

// Modalities
router.post("/modalities", taxonomyController.createModality);
router.patch("/modalities/:id", taxonomyController.updateModality);
router.delete("/modalities/:id", taxonomyController.deleteModality);

router.get("/bodyparts/manage", taxonomyController.getBodyPartsManage);
router.get("/bodyparts/:id/impact", taxonomyController.getBodyPartImpact);

// BodyParts
router.post("/bodyparts", taxonomyController.createBodyPart);
router.patch("/bodyparts/:id", taxonomyController.updateBodyPart);
router.delete("/bodyparts/:id", taxonomyController.deleteBodyPart);

module.exports = router;
