const jwt = require("jsonwebtoken");
const config = require("config");

module.exports = (req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  try {
    const token = req.headers.authorization.split(" ")[1];

    if (!token) {
      console.log("Упс");
      return res.status(401).json({ message: "Auth error" });
    }
    const decoded = jwt.verify(token, config.get("secretKey"));

    req.user = decoded;
    next();
  } catch (e) {
    console.log(e.response);
    return res.status(401).json({ message: `${e}` });
  }
};
