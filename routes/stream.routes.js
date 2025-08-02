const { Router } = require("express");

const router = new Router();

const fileController = require("../controllers/fileController");

const authMiddleware = require("../middleware/auth.middleware");
const yandexApi = require("../services/yandexApi");

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

router.get("/proxy-download", yandexApi.downloadFile);

module.exports = router;
