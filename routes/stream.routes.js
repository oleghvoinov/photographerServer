const { Router } = require("express");

const router = new Router();

const fileController = require("../controllers/fileController");

const authMiddleware = require("../middleware/auth.middleware");

router.post(
  "/uploadZipFileYandexStream",
  authMiddleware,
  fileController.uploadZipFileYandexStream
);

router.post(
  "/uploadZipFileYandexStreamMin",
  authMiddleware,
  fileController.uploadZipFileYandexStreamMin
);

module.exports = router;
