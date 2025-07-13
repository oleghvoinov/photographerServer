const config = require("config");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const username = config.get("username");
const password = config.get("password");
const dbName = config.get("dbName");
const nano = require("nano")(`http://${username}:${password}@localhost:5984`);

async function creatUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Uncorrect request", errors });
    }

    const { email, password } = req.body;
    const db = nano.db.use(dbName);
    const query = { name: email };

    const result = await db.find({ selector: query });

    if (result.docs.length > 0) {
      return res
        .status(400)
        .json({ massage: `Пользователь с email ${email} уже существует` });
    }
    const hashPassword = await bcrypt.hash(password, 8);

    const insertData = await db.insert({ name: email, password: hashPassword });
    return res.json({ massage: "User was created" });
  } catch (e) {
    console.log(e);
    return res.send({ message: "Server error" });
  }
}

async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    const db = nano.db.use(dbName);
    const query = { name: email };

    const result = await db.find({ selector: query });

    if (result.docs.length == "0") {
      return res
        .status(400)
        .json({ massage: `Аккаунта с ${email} не найдено` });
    }

    const user = result.docs[0];

    const isPassValid = bcrypt.compareSync(password, user.password);
    if (!isPassValid) {
      return res.status(400).json({ message: "Неверный пароль" });
    }

    const token = jwt.sign({ id: user._id }, config.get("secretKey"), {
      expiresIn: "1h",
    });

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
      },
    });
  } catch (e) {
    console.log(e);
    res.send({ message: "Server error" });
  }
}

async function getAuth(req, res) {
  try {
    const db = nano.db.use(dbName);
    const user = await db.get(req.user.id);

    const token = jwt.sign({ id: user._id }, config.get("secretKey"), {
      expiresIn: "1h",
    });
    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
      },
    });
  } catch (e) {
    // console.log(e.response);
    res.send({ message: "Server error" });
  }
}

module.exports = { creatUser, loginUser, getAuth };
