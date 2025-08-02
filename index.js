const express = require("express");
const fileUpLoad = require("express-fileupload");
const config = require("config");
const corsMiddleware = require("./middleware/cors.middleware");
const authRouter = require("./routes/auth.routes");
const fileRouter = require("./routes/file.routes");
const streamRouter = require("./routes/stream.routes");
const path = require("path");

const app = express();
const PORT = config.get("serverPort");

app.use(corsMiddleware);

app.use("/api", streamRouter);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(fileUpLoad({}));

app.use(express.json());

// app.use((req, res, next) => {
//   res.setHeader("Content-Type", "text/html; charset=utf-8");
//   next();
// });

// app.use((req, res, next) => {
//   res.setHeader("Content-Type", "application/json; charset=utf-8");
//   next();
// });

// app.use((req, res, next) => {
//   console.log(`Request: ${req.method} ${req.url}`);
//   next();
// });

app.use("/api/auth", authRouter);
app.use("/api/files", fileRouter);

app.use(
  "/admin/files",
  express.static(path.join(__dirname, "public", "files"))
);

const start = async () => {
  try {
    app.listen(PORT, () => {
      console.log("Сервер запустился");
    });
  } catch (e) {}
};

start();
