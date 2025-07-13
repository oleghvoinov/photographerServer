const { Router } = require("express");
const controller = require("../controllers/userController");
const { check, validationResult } = require("express-validator");
const router = new Router();
const authMiddleware = require("../middleware/auth.middleware");

router.post(
  "/registration",
  [
    check("email", "Uncorrect email").isEmail(),
    check(
      "password",
      "Password must be longer than 3 and shorter than 12"
    ).isLength({ min: 3, max: 12 }),
  ],
  controller.creatUser
);

router.post("/inlogin", controller.loginUser);
router.get("/auth", authMiddleware, controller.getAuth);

module.exports = router;
