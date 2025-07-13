const { Router } = require("express");

const router = new Router();
const authMiddleware = require("../middleware/auth.middleware");
const fileController = require("../controllers/fileController");

router.post("/uploadZipFile", authMiddleware, fileController.uploadZipFile11);
router.post("/uploadOneZip", authMiddleware, fileController.uploadOneZip);
router.post(
  "/uploadZipFileYandexStream",

  fileController.uploadZipFileYandexStream
);

router.post(
  "/uploadZipFileYandexNoStream",
  authMiddleware,
  fileController.uploadZipFileYandexNoStream
);

router.delete(
  "/deleteZipFileNoStream",
  authMiddleware,
  fileController.deleteZipFileNoStream
);

router.get("/getFilesMainPage", fileController.getFilesMainPage);

router.post(
  "/uploadFileMainPage",
  authMiddleware,

  fileController.uploadFileMainPage
);
router.post("/uploadPrewieImg", authMiddleware, fileController.uploadPrewieImg);
router.post(
  "/uploadChildrenImg",
  authMiddleware,
  fileController.uploadChildrenImg
);

router.delete(
  "/deleteFileMainPage",
  authMiddleware,
  fileController.deleteFileMainPage
);
router.delete(
  "/deletePrewieImg",
  authMiddleware,
  fileController.deletePrewieImg
);
router.delete(
  "/deleteChildrenImg",
  authMiddleware,
  fileController.deleteChildrenImg
);

router.post("/createDir", authMiddleware, fileController.createDir);
router.post("/updateDir", authMiddleware, fileController.updateDir);
router.get("/getDir", fileController.getDir);
router.get("/getOneDir", fileController.getOneDir);
router.delete("/deleteDir", authMiddleware, fileController.deleteDir);

router.post("/updatePrewieImg", authMiddleware, fileController.updatePrewieImg);

router.get("/downloadFront", fileController.downloadFrontImg);

router.post("/createTab", authMiddleware, fileController.createTab);
router.delete("/deleteTab", authMiddleware, fileController.deleteTab);

module.exports = router;
