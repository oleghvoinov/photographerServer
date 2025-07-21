const config = require("config");

const fileService = require("../services/fileService");
const yandexApi = require("../services/yandexApi");

const username = config.get("username");
const password = config.get("password");
const dbName = config.get("dbName");
const dbFile = config.get("dbFile");
const nano = require("nano")(`http://${username}:${password}@localhost:5984`);
const db = nano.db.use(dbFile);

const mainDesign = "mainPage";
const mainIndexName = "mainPage-view";

const mainIndexDesign = "mainPageIndex";
const mainIndexIndexName = "mainPageIndex-view";

const prewDesign = "prewDoc";
const prewIndexName = "prew-view";

const prewNameDesign = "prewName";
const prewNameIndexName = "prewName-view";

const childDesign = "childrenDoc";
const childIndexName = "children-view";

const childIdDesign = "childrenId";
const childIdIndexName = "childrenId-view";

const dirDesign = "dir";
const dirIndexName = "dir-view";

const dirIdDesign = "dirId";
const dirIdIndexName = "dirId-view";

const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const fse = require("fs-extra");
const archiver = require("archiver");
const { PassThrough } = require("stream");

const sharp = require("sharp");

const Busboy = require("busboy");

const unzipper = require("unzipper");
const { rejects } = require("assert");

class FileController {
  async createDir(req, res) {
    try {
      const { name, inPortfolio, date } = req.body;

      const resAll = await db.view(dirDesign, dirIndexName, {
        limit: 0, // не загружает строки
        include_docs: false,
      });

      const { rows } = await db.view(dirDesign, dirIndexName, {
        include_docs: false,
        startkey: [name],
        endkey: [name, {}],
      });

      if (rows.length != 0) {
        return res.status(400).json({
          message: `Проект с таким именем ${name} уже существует.`,
        });
      }

      const fileDir = {
        name,
        type: "dir",
        inPortfolio,
        date,
        prewieImg: [],
        children: [],
        zip: "",
        zipMIn: "",
        index: resAll.total_rows || 0,
      };
      const insertDir = await db.insert(fileDir);
      await fileService.createProject(fileDir.index);

      return res.json(fileDir);
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async updateDir(req, res) {
    try {
      const id = req.query.id;

      const { name, inPortfolio, date } = req.body;

      const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
        include_docs: true,
        key: id,
      });

      let dir;

      if (rows.length != 0) {
        dir = rows[0].doc;
      } else {
        return res.status(400).json({ message: "Упс, кейс не найден!" });
      }

      dir.name = name;
      dir.inPortfolio = inPortfolio;
      dir.date = date;

      const newDir = await db.insert(dir);

      return res.json({ ...dir, ...newDir });
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async deleteDir(req, res) {
    try {
      const id = req.query.id;

      const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
        include_docs: true,
        key: id,
      });

      let dir;

      if (rows.length != 0) {
        dir = rows[0].doc;
      } else {
        return res.status(400).json({ message: "Упс, кейс не найден!" });
      }

      let flag = true;

      try {
        const folderPath = path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          String(dir.index)
        );
        console.log("Удаляем папку:", folderPath); // Логируем путь для отладки

        if (fs.existsSync(folderPath)) {
          // fileService.deleteDirRecursive(folderPath);
          // rimraf(folderPath, { maxBusyTries: 3, retries: 5 }, (err) => {
          //   if (err) {
          //     console.error("Ошибка при удалении папки:", err.message);
          //   }
          // });
          //fs.removeSync(folderPath);  Удаление папки и её содержимого

          try {
            const checkFlag = await yandexApi.checkFolderExists(
              path.join("myPortfolio", "portfolio", String(dir.index))
            );
            if (checkFlag) {
              console.log("Удаляю папку в яндексе");
              await yandexApi.deleteFile(
                path.join("myPortfolio", "portfolio", String(dir.index))
              );
              console.log("Папка удалена");
            }
          } catch (error) {
            res
              .status(500)
              .json({ error: "Ошибка при удалении папки в yandexDisk" });
          }

          console.log("Пробую удалить:", folderPath);
          console.log(
            "Содержимое перед удалением:",
            fs.readdirSync(folderPath)
          );

          try {
            try {
              for (const item of dir.children) {
                console.log(
                  "Пробую удалить:",
                  path.join(folderPath, "children", String(item.index))
                );
                await fse.remove(
                  path.join(folderPath, "children", String(item.index))
                );
              }
            } catch (e) {
              console.error(
                `Ошибка при удалении подпапок children:`,
                e.message
              );
            }

            try {
              await fse.remove(path.join(folderPath, "children"));
            } catch (e) {
              console.error(`Ошибка при удалении папки children:`, e.message);
            }

            try {
              await fse.remove(path.join(folderPath, "prewie"));
            } catch (e) {
              console.error(`Ошибка при удалении папки prewie:`, e.message);
            }

            await fse.remove(folderPath);
          } catch (e) {
            try {
              await fse.remove(folderPath);
            } catch (e) {
              flag = false;
            }

            console.error("Ошибка при удалении папки:", e.message);
          }
        } else {
          res.status(400).json({ message: "Папка не найдена!" });
        }
      } catch (e) {
        console.error("Ошибка при удалении папки:", e.message); // Логируем ошибку
        return res
          .status(500)
          .json({ message: `Ошибка при удалении папки: ${e.message}` });
      }

      try {
        const { rows } = await db.view(prewDesign, prewIndexName, {
          include_docs: true,
          startkey: [id],
          endkey: [id, {}],
        });

        if (rows.length > 0) {
          const docsToDelete = rows.map((row) => ({
            _id: row.doc._id,
            _rev: row.doc._rev,
            _deleted: true,
          }));

          await db.bulk({ docs: docsToDelete });
        }
      } catch (err) {
        console.error("Ошибка при удалении превью", err.message, err);
      }

      try {
        const { rows } = await db.view(childDesign, childIndexName, {
          include_docs: true,
          startkey: [id],
          endkey: [id, {}],
        });

        if (rows.length > 0) {
          const docsToDelete = rows.map((row) => ({
            _id: row.doc._id,
            _rev: row.doc._rev,
            _deleted: true,
          }));
          await db.bulk({ docs: docsToDelete });
        }
      } catch (err) {
        console.error("Ошибка при удалении дочернего файла", err.message, err);
      }

      try {
        if (flag) {
          console.log("Удаляем основной документ:", dir._id, dir._rev);
          await db.destroy(dir._id, dir._rev);
        } else {
          return res
            .status(400)
            .json({ message: "Кейс удален не полностью, попробуйте ещё раз!" });
        }
      } catch (e) {
        return res
          .status(400)
          .json({ message: "Упс, запрос на сервер оборван!" });
      }
      console.log("Удаление завершено!");
      return res.json({ message: "Директория удалена" });
    } catch (e) {
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async getDir(req, res) {
    try {
      const query = { type: "dir" };

      const { rows } = await db.view(dirDesign, dirIndexName, {
        include_docs: true,
      });

      const docs = rows.map((row) => row.doc);

      res.json(docs);
    } catch (e) {
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async getOneDir(req, res) {
    try {
      const id = req.query.id;

      const result1 = await db.view(dirIdDesign, dirIdIndexName, {
        key: id,
        include_docs: true,
      });

      const docs = result1.rows.map((row) => row.doc);

      if (docs.length != 0) {
        return res.json(docs[0]);
      } else {
        return res.json({});
      }
    } catch (e) {
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async uploadPrewieImg(req, res) {
    try {
      const idPerent = req.query.id;
      const file = req.files.file;

      let result;

      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;

          if (result?.prewieImg != 0) {
            for (let i = 0; i < result.prewieImg.length; i++) {
              if (result.prewieImg[i].name == file.name) {
                return res.status(400).json({
                  message: `Изображение с именем ${file.name} уже существует`,
                });
              }
            }
          }
        } else {
          return res.status(400).json({
            message: `Ошибка при чтении из базы данных.`,
          });
        }
      } catch (error) {
        console.error("❌ Ошибка при запросе к базе данных:", e.message);
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      try {
        const outputPath = path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          `${result.index}`,
          "prewie",
          String(file.name)
        );

        await fs.promises.mkdir(path.dirname(outputPath), {
          recursive: true,
        });

        file.mv(outputPath);
      } catch (err) {
        console.error("❌ Ошибка при загрузке файла:", err.message);
        return res.status(500).send("Ошибка при загрузке файла");
      }

      const prewieImg = {
        name: file.name,
        path: path.join(
          __dirname,
          "uploads",
          "portfolio",
          `${result.index}`,
          "prewie",
          String(file.name)
        ),
        perentId: idPerent,
        type: "Prewie",
      };
      const addPrewieImg = await db.insert(prewieImg);

      result["prewieImg"].push({ ...addPrewieImg, ...prewieImg });

      try {
        await db.insert(result);
      } catch (e) {
        console.log(e);
        return res.status(400).json({ message: "Упс!" });
      }

      return res.json(prewieImg);
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async deletePrewieImg(req, res) {
    try {
      const id = req.query.id;

      const { rows } = await db.view(prewNameDesign, prewNameIndexName, {
        key: id,
        include_docs: true,
      });
      console.log("id", id);
      console.log("rows", rows);

      const prewieImg = rows[0].doc;

      const result = await db.view(dirIdDesign, dirIdIndexName, {
        key: prewieImg.perentId,
        include_docs: true,
      });

      let dir = result.rows[0].doc;

      const deletePrewieImg = await db.destroy(prewieImg._id, prewieImg._rev);

      for (let i = 0; i < dir["prewieImg"].length; i++) {
        if (dir["prewieImg"][i].id == prewieImg._id) {
          dir["prewieImg"].splice(i, 1);

          const update = await db.insert(dir);
          break;
        }
      }

      fs.unlinkSync(
        path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          String(dir.index),
          "prewie",
          String(prewieImg.name)
        )
      );

      return res.json({ message: "File was deleted" });
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async uploadChildrenImg(req, res) {
    try {
      const idPerent = req.query.id;
      const index = req.query.index;
      let file = req.files.file;

      if (!req.files) {
        return res.status(400).send({ message: "Файл не был загружен." });
      }
      const size = file.size;

      const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
        key: idPerent,
        include_docs: true,
      });
      let result;

      if (rows.length != 0) {
        result = rows[0].doc;
      } else {
        console.log(e);
        return res.status(400).json({ message: "Упс, кейса не найдено!" });
      }

      const arrTab = result.children.find((ch) => ch.index == index);

      if (arrTab.tab.length != 0) {
        for (let i = 0; i < arrTab.tab.length; i++) {
          if (arrTab.tab[i].name == file.name) {
            return res.status(400).json({
              message: `Изображение с именем ${file.name} уже существует`,
            });
          }
        }
      }

      const yandexPath = path.join(
        "myPortfolio",
        "portfolio",
        String(result.index),
        "children",
        String(index),
        String(file.name)
      );

      try {
        await yandexApi.uploadFile(yandexPath, file);
      } catch (e) {
        console.log("Что то пошло не так при передаче файла на YandexDisk");
      }

      if (file.mimetype.includes("image")) {
        file = await fileService.convertAndCompressImage(file);
      }

      const yandexPathMini = path.join(
        "myPortfolio",
        "portfolio",
        String(result.index),
        "children",
        String(index),
        `${path.parse(file.name).name}_Mini${path.extname(file.name)}`
      );

      try {
        await yandexApi.uploadFile(yandexPathMini, file);
      } catch (e) {
        console.log(
          "Что то пошло не так при передаче сжатого файла на YandexDisk"
        );
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      fs.writeFileSync(
        path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          String(result.index),
          "children",
          String(index),
          String(file.name)
        ),
        file.data
      );

      const childrenImg = {
        name: file.name,
        path: path.join(
          __dirname,
          "uploads",
          "portfolio",
          String(result.index),
          "children",
          String(index),
          String(file.name)
        ),
        yandexPath: yandexPath,
        perentId: idPerent,
        type: "Children",
        size,
        sizeMin: file.size,
      };
      const addChildrenImg = await db.insert(childrenImg);

      if (arrTab) {
        arrTab.tab.push({ ...addChildrenImg, ...childrenImg });
      }

      const update = await db.insert(result);

      res.json(childrenImg);
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async deleteChildrenImg(req, res) {
    try {
      const id = req.query.id;
      const index = req.query.index;

      const resultChild = await db.view(childIdDesign, childIdIndexName, {
        key: id,
        include_docs: true,
      });

      let childrenImg;
      if (resultChild.rows.length != 0) {
        childrenImg = resultChild.rows[0].doc;
      } else {
        res.status(500).json({ error: "Файл не найден в базе данных" });
      }

      const resultDir = await db.view(dirIdDesign, dirIdIndexName, {
        key: childrenImg.perentId,
        include_docs: true,
      });

      let dir;

      if (resultDir.rows.length != 0) {
        dir = resultDir.rows[0].doc;
      }

      const deleteChildrenImg = await db.destroy(
        childrenImg._id,
        childrenImg._rev
      );

      try {
        await yandexApi.deleteFile(childrenImg.yandexPath);
      } catch (error) {
        res
          .status(500)
          .json({ error: "Ошибка при удалении папки в yandexDisk" });
      }

      const yandexPathMini = path.join(
        path.dirname(childrenImg.yandexPath),
        `${path.parse(childrenImg.name).name}_Mini${path.extname(
          childrenImg.name
        )}`
      );

      try {
        await yandexApi.deleteFile(yandexPathMini);
      } catch (error) {
        res
          .status(500)
          .json({ error: "Ошибка при удалении папки в yandexDisk" });
      }

      const arrTab = dir.children.find((ch) => ch.index == index);

      for (let i = 0; i < arrTab.tab.length; i++) {
        if (arrTab.tab[i].id == childrenImg._id) {
          arrTab.tab.splice(i, 1);

          const update = await db.insert(dir);
          break;
        }
      }

      fs.unlinkSync(
        path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          String(dir.index),
          "children",
          String(index),
          String(childrenImg.name)
        )
      );

      return res.json({ message: "Файл успешно удален" });
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async getFilesMainPage(req, res) {
    try {
      let newImgArr = [];

      const resultMain = await db.view(mainDesign, mainIndexName, {
        include_docs: true,
      });

      if (resultMain.rows.length != 0) {
        const result = resultMain.rows.map((row) => row.doc);
        if (result.length > 0) {
          for (let i = 0; i < result.length; i++) {
            newImgArr[result[i].index] = result[i];
          }
        }
      }

      res.json(newImgArr);
    } catch (e) {
      console.log(e);
      return res
        .status(400)
        .json({ message: "Упс, запрос на сервер оборван!" });
    }
  }

  async uploadFileMainPage(req, res) {
    try {
      const file = req.files.file;
      const index = req.query.parent;

      const resultMain = await db.view(mainDesign, mainIndexName, {
        include_docs: true,
      });

      if (resultMain.rows.length != 0) {
        const results = resultMain.rows.map((row) => row.doc);

        for (const result of results) {
          if (result.name == file.name) {
            return res.status(400).json({
              message: `Изображение с именем ${file.name} уже существует`,
            });
          }
        }
      }

      const pathFile = fileService.getPathMainPage(file);
      const type = file.name.split(".").pop();

      const yandexPath = path.join(
        "myPortfolio",
        "mainPage",
        String(file.name)
      );

      console.log(path.dirname(pathFile));

      fs.mkdirSync(path.dirname(pathFile), { recursive: true });

      file.mv(pathFile);

      const dbFile = {
        name: file.name,
        type,
        local: "MainPage",
        path: path.join(__dirname, "uploads", "mainPage", String(file.name)),
        yandexPath: yandexPath,
        size: file.size,
        date: new Date(),
        index: index,
      };

      const insertData = await db.insert(dbFile);

      try {
        await yandexApi.uploadFile(yandexPath, file);
      } catch (e) {
        console.log("Что то пошло не так при передаче на YandexDisk");
      }

      res.json(dbFile);
    } catch (e) {
      console.log(e);
      return res
        .status(500)
        .json({ message: "Error uploading files to the main page!" });
    }
  }

  async deleteFileMainPage(req, res) {
    try {
      const index = req.query.id;

      const resultMain = await db.view(mainIndexDesign, mainIndexIndexName, {
        key: index,
        include_docs: true,
      });

      if (resultMain.rows.length != 0) {
        const file = resultMain.rows[0].doc;

        fs.unlinkSync(
          path.join(__dirname, "..", "uploads", "mainPage", String(file.name))
        );

        const result = await db.destroy(file._id, file._rev);

        try {
          await yandexApi.deleteFile(file.yandexPath);
        } catch (error) {
          res
            .status(500)
            .json({ error: "Ошибка при удалении папки в yandexDisk" });
        }

        return res.json({ message: "File was deleted" });
      } else {
        res.status(500).json({ error: "Ошибка! Файл не обнаружено" });
      }
    } catch (e) {
      console.log(e);
      return res.status(400).json({ message: "File is not empty" });
    }
  }

  async updatePrewieImg(req, res) {
    try {
      const idDir = req.query.id;

      const newPrewArr = req.body.arr;

      const result1 = await db.view(dirIdDesign, dirIdIndexName, {
        key: idDir,
        include_docs: true,
      });

      if (result1.rows.length != 0) {
        let dir = result1.rows[0].doc;

        const sortedPrewArr = dir.prewieImg.sort((a, b) => {
          const aIndex = newPrewArr.findIndex((el) => el.uid === a.id);
          const bIndex = newPrewArr.findIndex((el) => el.uid === b.id);
          return aIndex - bIndex;
        });

        dir.prewieImg = sortedPrewArr;

        const newDir = await db.insert(dir);
        return res.json({ ...dir, ...newDir });
      } else {
        return res.status(400).json({ message: "Кейса не обнаружено!" });
      }
    } catch (e) {
      console.log(e);
      return res.status(400).json({ message: "File is not empty" });
    }
  }

  async downloadFrontImg(req, res) {
    try {
      const id = req.query.id;

      const file = await db.get(id);

      // const cleanedRelativePath = file.path.replace(/^\/+/, "");
      // const normalizedFilePath = file.path.replace(/\//g, "\\");

      // const cleanedFilePath = normalizedFilePath.replace(
      //   "files\\portfolio\\",
      //   ""
      // );

      // const fullPath = path.join(config.get("dirFiles"), cleanedFilePath);

      try {
        fs.statSync(file.path);
      } catch (err) {
        console.error("File is not accessible:", err);
        return res.status(400).json({ message: "File access error" });
      }

      return res.download(fullPath, file.name);
    } catch (e) {
      console.log(e);
      return res.status(400).json({ message: "Download error" });
    }
  }
  async createTab(req, res) {
    try {
      const idDir = req.query.id;
      const index = req.query.index;
      const name = req.query.name;

      const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
        key: idDir,
        include_docs: true,
      });

      if (rows.length != 0) {
        const dir = rows[0].doc;

        for (let i = 0; i < dir.children.length; i++) {
          if (dir.children[i].name == name || dir.children[i].index == index) {
            return res.status(400).json({
              message: "Вкладка с таким именем или индексом уже сущестует!",
            });
          }
        }

        dir.children.push({ index, name, tab: [] });

        const filePath = path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          String(dir.index),
          "children",
          String(index)
        );

        if (!fs.existsSync(filePath)) {
          fs.mkdirSync(filePath);
        } else {
          return res.status(400).json({ message: "File already exist" });
        }

        const newDir = await db.insert(dir);

        return res.json({ ...dir, ...newDir });
      } else {
        return res.status(400).json({ message: "Кейсов не найдено." });
      }
    } catch (e) {
      console.log(e);
      return res.status(400).json({ message: "Create tab error" });
    }
  }

  async deleteTab(req, res) {
    try {
      const idDir = req.query.id;
      const index = req.query.index;

      let dir;

      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idDir,
          include_docs: true,
        });

        if (rows.length != 0) {
          dir = rows[0].doc;
        } else {
          return res.status(400).json({ message: "Create tab error" });
        }
      } catch (err) {
        return res.status(400).json({ message: "Create tab error" });
      }

      try {
        const folderPath = path.join(
          __dirname,
          "..",
          "uploads",
          "portfolio",
          String(dir.index),
          "children",
          String(index)
        );

        if (fs.existsSync(folderPath)) {
          try {
            fse.removeSync(folderPath);
          } catch (err) {
            res.status(400).json({ message: "Папка не найдена!" });
          }
        } else {
          res.status(400).json({ message: "Папка не найдена!" });
        }
      } catch (e) {
        console.error("Ошибка при удалении папки:", e.message); // Логируем ошибку
        return res
          .status(500)
          .json({ message: `Ошибка при удалении папки: ${e.message}` });
      }

      try {
        const yandexPath = path.join(
          "myPortfolio",
          "portfolio",
          String(dir.index),
          "children",
          String(index)
        );

        const folders = await yandexApi.checkFolderExists(yandexPath);

        if (folders) {
          yandexApi.deleteFile(yandexPath);
        }
      } catch (err) {
        console.error("Ошибка при удалении папки:", e.message); // Логируем ошибку
        return res
          .status(500)
          .json({ message: `Ошибка при удалении yndex папки: ${e.message}` });
      }

      let update;

      for (let j = 0; j < dir.children.length; j++) {
        if (dir.children[i].index == index) {
          for (let i = 0; i < dir.children[j].tab.length; i++) {
            try {
              const childrenFile = await db.get(dir.children[j].tab[i].id);

              await db.destroy(childrenFile._id, childrenFile._rev);
            } catch (e) {
              // return res.status(400).joun({
              //   message: `При удалении файла ${childrenFile.name} из бд возникла ошибка!`,
              // });
            }
          }
        }
      }

      for (let i = 0; i < dir.children.length; i++) {
        if (dir.children[i].index == index) {
          dir.children.splice(i, 1);

          update = await db.insert(dir);
          break;
        }
      }

      // const newDir = await db.insert(dir);

      return res.json({ ...dir, ...update });
    } catch (e) {
      console.log(e);
      return res.status(400).json({ message: "Delete tab error" });
    }
  }

  async uploadZipFile1(req, res) {
    console.log("Запрос на сервере: Получение потока...");

    const idPerent = req.query.id;
    const index = req.query.index;
    const filesUploaded = [];
    const filesFailed = [];
    const maxWidth = 1920;
    const maxHeight = 1080;
    let result;

    try {
      result = await db.get(idPerent);
    } catch (e) {
      return res.status(500).send("Ошибка при чтении из базы данных.");
    }

    const arrTab = result.children.find((ch) => ch.index == index);

    try {
      const archiveStream = unzipper.Parse();
      req.pipe(archiveStream);

      const fileProcessingPromises = [];

      archiveStream.on("entry", (file) => {
        if (file.type === "File") {
          const processFile = async () => {
            try {
              let fileName = path.basename(file.path); // Получаем только имя файла
              let flag = true;
              let count = 1;

              while (flag) {
                flag = arrTab.tab.some((item) => item.name === fileName);
                if (flag)
                  fileName = `${path.basename(
                    file.path,
                    path.extname(file.path)
                  )}_${count++}${path.extname(file.path)}`;
              }

              const outputPath = path.join(
                config.get("dirFiles"),
                `${result.index}`,
                "children",
                `${index}`,
                String(fileName)
              );

              if (/\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
                // Обрабатываем изображение
                const chunks = [];
                file.on("data", (chunk) => chunks.push(chunk));

                await new Promise((resolve) => file.on("end", resolve));

                const buffer = Buffer.concat(chunks);
                const compressedBuffer = await sharp(buffer)
                  .resize({ width: maxWidth, height: maxHeight, fit: "inside" })
                  .toBuffer();

                console.log("Сохраняем в:", outputPath);
                await fs.promises.writeFile(outputPath, compressedBuffer);
                console.log(
                  `✅ Изображение ${fileName} успешно сжато и сохранено.`
                );
              } else {
                // Обычные файлы
                await new Promise((resolve, reject) => {
                  const fileStream = fs.createWriteStream(outputPath);
                  file.pipe(fileStream);
                  fileStream.on("finish", resolve);
                  fileStream.on("error", reject);
                });
              }

              const childrenImg = {
                name: fileName,
                path: `/files/portfolio/${result.index}/children/${index}/${fileName}`,
                perentId: idPerent,
                type: "Children",
              };

              filesUploaded.push(childrenImg);
            } catch (error) {
              console.error(
                `❌ Ошибка при обработке файла ${file.path}:`,
                error.message
              );
              filesFailed.push({ file: file.path, error: error.message });
            }
          };

          fileProcessingPromises.push(processFile());
        } else {
          file.autodrain();
        }
      });

      archiveStream.on("close", async () => {
        try {
          await Promise.allSettled(fileProcessingPromises);

          if (arrTab) {
            const dbInsertPromises = filesUploaded.map(async (childrenImg) => {
              const addChildrenImg = await db.insert(childrenImg);
              arrTab.tab.push({ ...addChildrenImg, ...childrenImg });
            });

            await Promise.all(dbInsertPromises);
            await db.insert(result);
          }

          console.log("Распаковка завершена.");
          res.send({
            message: "Загрузка завершена.",
            filesUploaded,
            filesFailed,
          });
        } catch (error) {
          console.error(
            "Ошибка при завершении обработки файлов.",
            error.message
          );
          res.status(500).send("Ошибка при завершении обработки файлов.");
        }
      });

      archiveStream.on("error", (err) => {
        console.error("Ошибка при распаковке:", err);
        res.status(500).send("Ошибка при распаковке архива.");
      });
    } catch (error) {
      console.error("❌ Ошибка при распаковке архива:", error.message);
      res.status(500).send("Ошибка при распаковке архива.");
    }
  }

  async uploadZipFile(req, res) {
    console.log("Запрос на сервере: Получение потока...");

    try {
      const archiveStream = unzipper.Parse();
      req.pipe(archiveStream);

      const idPerent = req.query.id;
      const index = req.query.index;
      const filesUploaded = [];
      const filesFailed = [];
      const maxWidth = 1920;
      const maxHeight = 1080;
      let result;

      try {
        result = await db.get(idPerent);
      } catch (e) {
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      const arrTab = result.children.find((ch) => ch.index == index);

      const fileProcessingPromises = [];

      archiveStream.on("entry", (file) => {
        if (file.type === "File") {
          const processFile = async () => {
            try {
              let fileName = path.basename(file.path); // Получаем только имя файла
              let flag = true;
              let count = 1;

              while (flag) {
                flag = arrTab.tab.some((item) => item.name === fileName);
                if (flag)
                  fileName = `${path.basename(
                    file.path,
                    path.extname(file.path)
                  )}_${count++}${path.extname(file.path)}`;
              }

              const outputPath = path.join(
                config.get("dirFiles"),
                `${result.index}`,
                "children",
                `${index}`,
                String(fileName)
              );

              if (/\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
                // Обрабатываем изображение
                const chunks = [];
                file.on("data", (chunk) => chunks.push(chunk));

                await new Promise((resolve) => file.on("end", resolve));

                const buffer = Buffer.concat(chunks);
                const compressedBuffer = await sharp(buffer)
                  .resize({ width: maxWidth, height: maxHeight, fit: "inside" })
                  .toBuffer();

                console.log("Сохраняем в:", outputPath);
                await fs.promises.writeFile(outputPath, compressedBuffer);
                console.log(
                  `✅ Изображение ${fileName} успешно сжато и сохранено.`
                );

                const yandexPath = `myPortfolio/portfolio/${result.index}/children/${index}/${fileName}`;

                try {
                  await yandexApi.uploadFile(yandexPath, file);
                } catch (e) {
                  console.log(
                    "Что то пошло не так при передаче файла на YandexDisk"
                  );
                }

                const yandexPathMini = `myPortfolio/portfolio/${
                  result.index
                }/children/${index}/${
                  path.parse(fileName).name
                }_Mini${path.extname(fileName)}`;

                try {
                  await yandexApi.uploadFile(yandexPathMini, {
                    data: compressedBuffer,
                    mimetype: file.mimetype,
                  });
                } catch (e) {
                  console.log(
                    "Что то пошло не так при передаче сжатого файла на YandexDisk"
                  );
                }

                const childrenImg = {
                  name: fileName,
                  path: path.join(
                    __dirname,
                    "uploads",
                    "portfolio",
                    String(result.index),
                    "children",
                    String(index),
                    String(fileName)
                  ),
                  perentId: idPerent,
                  type: "Children",
                  yandexPath: yandexPath,
                  size: file.size,
                  sizeMin: compressedBuffer.length,
                };
                filesUploaded.push(childrenImg);
              } else {
                // Обычные файлы
                await new Promise((resolve, reject) => {
                  const fileStream = fs.createWriteStream(outputPath);
                  file.pipe(fileStream);
                  fileStream.on("finish", resolve);
                  fileStream.on("error", reject);
                });
              }
            } catch (error) {
              console.error(
                `❌ Ошибка при обработке файла ${file.path}:`,
                error.message
              );
              filesFailed.push({ file: file.path, error: error.message });
            }
          };

          fileProcessingPromises.push(processFile());
        } else {
          file.autodrain();
        }
      });

      archiveStream.on("close", async () => {
        try {
          await Promise.allSettled(fileProcessingPromises);

          if (arrTab) {
            const dbInsertPromises = filesUploaded.map(async (childrenImg) => {
              const addChildrenImg = await db.insert(childrenImg);
              arrTab.tab.push({ ...addChildrenImg, ...childrenImg });
            });

            await Promise.all(dbInsertPromises);
            await db.insert(result);
          }

          console.log("Распаковка завершена.");
          res.send({
            message: "Загрузка завершена.",
            filesUploaded,
            filesFailed,
          });
        } catch (error) {
          console.error(
            "Ошибка при завершении обработки файлов.",
            error.message
          );
          res.status(500).send("Ошибка при завершении обработки файлов.");
        }
      });

      archiveStream.on("error", (err) => {
        console.error("Ошибка при распаковке:", err);
        res.status(500).send("Ошибка при распаковке архива.");
      });

      req.on("close", () => {
        console.log("⚠️ Соединение клиента было закрыто");
      });

      req.on("aborted", () => {
        console.warn("Клиент прервал соединение!");
        archiveStream.destroy(); // закрываем стрим, освобождаем ресурсы
      });
    } catch (error) {
      console.error("❌ Ошибка при распаковке архива:", error.message);
      res.status(500).send("Ошибка при распаковке архива.");
    }
  }

  async uploadZipFile11(req, res) {
    console.log("Запрос на сервере: Получение потока...");

    try {
      const archiveStream = unzipper.Parse();

      const idPerent = req.query.id;
      const index = req.query.index;
      const filesUploaded = [];
      const filesFailed = [];
      const maxWidth = 1920;
      const maxHeight = 1080;

      let result;
      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (e) {
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      const arrTab = result.children.find((ch) => ch.index == index);

      const fileProcessingPromises = [];

      archiveStream.on("entry", (file) => {
        if (file.type === "File") {
          const processFile = async () => {
            try {
              let fileName = path.basename(file.path);
              let flag = true;
              let count = 1;

              while (flag) {
                flag = arrTab.tab.some((item) => item.name === fileName);
                if (flag)
                  fileName = `${path.basename(
                    file.path,
                    path.extname(file.path)
                  )}_${count++}${path.extname(file.path)}`;
              }

              const outputPath = path.join(
                __dirname,
                "..",
                "uploads",
                "portfolio",
                `${result.index}`,
                "children",
                `${index}`,
                String(fileName)
              );

              // Создаём директорию, если её нет
              await fs.promises.mkdir(path.dirname(outputPath), {
                recursive: true,
              });

              if (/\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
                const chunks = [];
                file.on("data", (chunk) => chunks.push(chunk));
                await new Promise((resolve) => file.on("end", resolve));

                const buffer = Buffer.concat(chunks);
                const compressedBuffer = await sharp(buffer)
                  .resize({ width: maxWidth, height: maxHeight, fit: "inside" })
                  .toBuffer();

                await fs.promises.writeFile(outputPath, compressedBuffer);
                console.log(
                  `✅ Изображение ${fileName} сохранено:`,
                  outputPath
                );
                const yandexPath = path.join(
                  "myPortfolio",
                  "portfolio",
                  String(result.index),
                  "children",
                  String(index),
                  String(fileName)
                );

                try {
                  await yandexApi.uploadFile(yandexPath, {
                    data: buffer,
                    mimetype: file.mimetype,
                  });
                } catch (e) {
                  console.log(
                    "Что-то пошло не так при передаче файла на YandexDisk"
                  );
                }

                const yandexPathMini = path.join(
                  "myPortfolio",
                  "portfolio",
                  String(result.index),
                  "children",
                  String(index),
                  `${path.parse(fileName).name}_Mini${path.extname(fileName)}`
                );

                try {
                  await yandexApi.uploadFile(yandexPathMini, {
                    data: compressedBuffer,
                    mimetype: file.mimetype,
                  });
                } catch (e) {
                  console.log(
                    "Что-то пошло не так при передаче сжатого файла на YandexDisk"
                  );
                }

                const childrenImg = {
                  name: fileName,
                  path: path.join(
                    __dirname,
                    "uploads",
                    "portfolio",
                    String(result.index),
                    "children",
                    String(index),
                    String(fileName)
                  ),
                  perentId: idPerent,
                  type: "Children",
                  yandexPath: yandexPath,
                  size: buffer.length,
                  sizeMin: compressedBuffer.length,
                };

                filesUploaded.push(childrenImg);
              } else {
                await new Promise((resolve, reject) => {
                  const fileStream = fs.createWriteStream(outputPath);
                  file.pipe(fileStream);
                  fileStream.on("finish", resolve);
                  fileStream.on("error", reject);
                });
                console.log(`✅ Файл ${fileName} сохранён:`, outputPath);
                filesUploaded.push({
                  name: fileName,
                  path: outputPath,
                  perentId: idPerent,
                });
              }
            } catch (error) {
              console.error(
                `❌ Ошибка при обработке файла ${file.path}:`,
                error.message
              );
              filesFailed.push({ file: file.path, error: error.message });
            }
          };

          fileProcessingPromises.push(processFile());
        } else {
          file.autodrain();
        }
      });

      req.pipe(archiveStream);

      archiveStream.on("close", async () => {
        try {
          await Promise.allSettled(fileProcessingPromises);

          if (arrTab) {
            const dbInsertPromises = filesUploaded.map(async (childrenImg) => {
              const addChildrenImg = await db.insert(childrenImg);
              arrTab.tab.push({ ...addChildrenImg, ...childrenImg });
            });

            await Promise.all(dbInsertPromises);
            await db.insert(result);
          }

          console.log("Распаковка архива и загрузка завершены.");
          res.json({
            message: "Загрузка завершена.",
            filesUploaded,
            filesFailed,
          });
        } catch (error) {
          console.error(
            "Ошибка при завершении обработки файлов:",
            error.message
          );
          res.status(500).send("Ошибка при завершении обработки файлов.");
        }
      });

      archiveStream.on("error", (err) => {
        console.error("Ошибка при распаковке архива:", err);
        res.status(500).send("Ошибка при распаковке архива.");
      });

      req.on("close", () => {
        console.log("⚠️ Соединение клиента было закрыто");
      });

      req.on("aborted", () => {
        console.warn("Клиент прервал соединение!");
        archiveStream.destroy();
      });
    } catch (error) {
      console.error("❌ Ошибка при распаковке архива:", error.message);
      res.status(500).send("Ошибка при распаковке архива.");
    }
  }

  async uploadZipFile1(req, res) {
    console.log("Запрос на сервере: Получение потока...");

    const idPerent = req.query.id;
    const index = req.query.index;
    const filesUploaded = [];
    const maxWidth = 1920;
    const maxHeight = 1080;
    let result;

    try {
      result = await db.get(idPerent);
    } catch (e) {
      return res.status(500).send("Ошибка при чтении из базы данных.");
    }
    const arrTab = result.children.find((ch) => ch.index == index);

    try {
      const archiveStream = unzipper.Parse();

      req.pipe(archiveStream); // Принимаем поток напрямую

      archiveStream.on("entry", async (file) => {
        console.log("Обрабатываем файл:", file.path);
        if (file.type == "File") {
          let flag = true;
          let fileName = file.path;

          let count = 1;

          while (flag) {
            flag = false;

            if (arrTab.tab.length != 0) {
              for (let i = 0; i < arrTab.tab.length; i++) {
                if (arrTab.tab[i].name == fileName) {
                  flag = true;
                  fileName = `${fileName}_${count}`;
                  count++;
                }
              }
            }
          }

          const outputPath = `${config.get("dirFiles")}\\${
            result.index
          }\\children\\${index}\\${fileName}`;

          const fileStream = fs.createWriteStream(outputPath);

          try {
            if (file.path.match(/\.(jpg|jpeg|png|webp)$/i)) {
              const chunks = [];

              file.on("data", (chunk) => chunks.push(chunk));
              file.on("end", async () => {
                const buffer = Buffer.concat(chunks);

                const compressedBuffer = await sharp(buffer)
                  .resize({
                    width: maxWidth,
                    height: maxHeight,
                    fit: "inside",
                  })
                  .toBuffer();

                fs.writeFileSync(outputPath, compressedBuffer);

                const childrenImg = {
                  name: fileName,
                  path: path.join(
                    __dirname,
                    "uploads",
                    "portfolio",
                    String(result.index),
                    "children",
                    String(index),
                    String(fileName)
                  ),

                  perentId: idPerent,
                  type: "Children",
                };

                filesUploaded.push(childrenImg);

                console.log(
                  `✅ Изображение ${file.path} успешно сжато и сохранено.`
                );
              });
            } else {
              file.pipe(fileStream);
            }
          } catch (error) {
            console.error(
              `❌ Ошибка при обработке файла ${fileName}:`,
              error.message
            );
          }
        } else {
          file.autodrain();
        }
      });

      archiveStream.on("close", async () => {
        try {
          for (let i = 0; i < filesUploaded.length; i++) {
            const addChildrenImg = await db.insert(filesUploaded[i]);
            if (arrTab) {
              arrTab.tab.push({ ...addChildrenImg, ...filesUploaded[i] });
            }
          }
          const update = await db.insert(result);
        } catch (e) {
          console.error("Ошибка при загрузки данных в базу.", error.message);
        }
        console.log("Распаковка завершена.");
        res.send({ message: "Загрузка завершена.", filesUploaded });
      });

      archiveStream.on("error", (err) => {
        console.error("Ошибка при распаковке:", err);
        res.status(500).send("Ошибка при распаковке архива.");
      });
    } catch (error) {
      console.error("❌ Ошибка при распаковке архива:", error.message);
      res.status(500).send("Ошибка при распаковке архива.");
    }
  }

  async uploadZipFile1111(req, res) {
    console.log("Запрос на сервере: Получение потока...");

    const idPerent = req.query.id;
    const index = req.query.index;
    const filesUploaded = [];
    const filesFailed = [];
    const maxWidth = 1920;
    const maxHeight = 1080;

    let result;
    try {
      result = await db.get(idPerent);
    } catch (e) {
      return res.status(500).send("Ошибка при чтении из базы данных.");
    }

    const arrTab = result.children.find((ch) => ch.index == index);

    const archiveStream = unzipper.Parse();

    archiveStream.on("entry", (file) => {
      console.log("Получен файл из архива:", file.path);

      if (file.type === "File") {
        (async () => {
          try {
            let fileName = path.basename(file.path);
            let flag = true;
            let count = 1;

            while (flag) {
              flag = arrTab.tab.some((item) => item.name === fileName);
              if (flag) {
                fileName = `${path.basename(
                  file.path,
                  path.extname(file.path)
                )}_${count++}${path.extname(file.path)}`;
              }
            }

            const outputPath = path.join(
              config.get("dirFiles"),
              `${result.index}`,
              "children",
              `${index}`,
              String(fileName)
            );

            if (/\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
              const chunks = [];
              file.on("data", (chunk) => chunks.push(chunk));
              await new Promise((resolve) => file.on("end", resolve));

              const buffer = Buffer.concat(chunks);
              const compressedBuffer = await sharp(buffer)
                .resize({ width: maxWidth, height: maxHeight, fit: "inside" })
                .toBuffer();

              await fs.promises.writeFile(outputPath, compressedBuffer);
              console.log(`✅ Изображение ${fileName} сохранено:`, outputPath);

              // Загрузка на Яндекс.Диск - можно оставить или убрать в целях дебага
            } else {
              await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(outputPath);
                file.pipe(out);
                out.on("finish", resolve);
                out.on("error", reject);
              });
              console.log(`✅ Файл ${fileName} сохранён:`, outputPath);
            }
            filesUploaded.push({ name: fileName });
          } catch (error) {
            console.error(`❌ Ошибка при обработке файла ${file.path}:`, error);
            filesFailed.push({ file: file.path, error: error.message });
          }
        })();
      } else {
        file.autodrain();
      }
    });

    archiveStream.on("close", async () => {
      console.log("Распаковка архива завершена");
      res.json({ filesUploaded, filesFailed });
    });

    archiveStream.on("error", (err) => {
      console.error("Ошибка при распаковке:", err);
      res.status(500).send("Ошибка при распаковке архива.");
    });

    req.pipe(archiveStream);
  }

  async uploadOneZip(req, res) {
    try {
      console.log("Запрос на сервере: Получение потока...");
      const idPerent = req.query.id;
      console.log(req.files);
      const archiveName = req.files.file.name;

      const maxWidth = 1920;
      const maxHeight = 1080;

      let result;

      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (e) {
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      const yandexPath = path.join(
        "myPortfolio",
        "portfolio",
        String(result.index),
        String(archiveName)
      );
      const yandexPathMini = path.join(
        "myPortfolio",
        "portfolio",
        String(result.index),
        `${path.parse(archiveName).name}_Mini${path.extname(archiveName)}`
      );

      try {
        await yandexApi.uploadFile(yandexPath, req.files.file);

        result.zip = { name: archiveName, path: yandexPath };
        await db.insert(result);
      } catch (err) {
        console.error(
          `❌ Ошибка при загрузке целикового архива ${archiveName}:`,
          err.message
        );
      }

      try {
        console.log("Пробуем создать поток");
        const archiveStream = unzipper.Parse();

        req.pipe(archiveStream); // Принимаем поток напрямую

        const zipStream = new PassThrough();
        const archive = archiver("zip", { zlib: { level: 9 } });

        archive.pipe(zipStream);

        const fileProcessingPromises = [];

        archiveStream.on("entry", (file) => {
          if (file.type === "File") {
            const processFile = async () => {
              try {
                let fileName = path.basename(file.path); // Получаем только имя файла

                if (/\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
                  // Обрабатываем изображение
                  const chunks = [];
                  file.on("data", (chunk) => chunks.push(chunk));

                  await new Promise((resolve) => file.on("end", resolve));

                  const buffer = Buffer.concat(chunks);
                  const compressedBuffer = await sharp(buffer)
                    .resize({
                      width: maxWidth,
                      height: maxHeight,
                      fit: "inside",
                    })
                    .toBuffer();
                  archive.append(compressedBuffer, { name: fileName });
                } else {
                  // Обычные файлы

                  archive.append(file.buffer, { name: fileName });
                }
              } catch (error) {
                console.error(
                  `❌ Ошибка при обработке файла ${file.path}:`,
                  error.message
                );
                filesFailed.push({ file: file.path, error: error.message });
              }
            };

            fileProcessingPromises.push(processFile());
          } else {
            file.autodrain();
          }
        });
        archiveStream.on("close", async () => {
          try {
            await Promise.allSettled(fileProcessingPromises);

            console.log(
              "✅ Распаковка завершена. Начинаем загрузку на Яндекс.Диск."
            );

            const uploadPromise = yandexApi.uploadStreamFile(
              yandexPathMini,
              zipStream
            );

            archive.finalize(); // Теперь сразу финализируем архив, а параллельно начинается загрузка

            await uploadPromise;

            result.zipMIn = { name: filename, path: yandexPathMini };
            await db.insert(result);

            return res.status(200).send("✅ Архив загружен на Яндекс.Диск");
          } catch (error) {
            console.error(
              "❌ Ошибка при завершении обработки файлов:",
              error.message
            );
            return res
              .status(500)
              .send("Ошибка при завершении обработки файлов.");
          }
        });
        archiveStream.on("error", (err) => {});
      } catch (error) {
        console.error("❌ Ошибка при распаковке архива:", error.message);
        res.status(500).send("Ошибка при распаковке архива.");
      }
    } catch (error) {
      console.error("❌ Ошибка при загрузке архива:", error.message);
      res.status(500).send("Ошибка при загрузке архива.");
    }
  }

  async uploadZipFileYandexStream1(req, res) {
    try {
      const idPerent = req.query.id;

      const busboy = new Busboy({ headers: req.headers });

      let result;
      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (e) {
        console.error("❌ Ошибка при запроса к базе данных:", error.message);
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      let uploadDone = false;

      busboy.on(
        "file",
        async (fieldname, fileStream, filename, encoding, mimetype) => {
          console.log("Имя поля:", fieldname);
          console.log(`📥 Получен файл: ${filename} (${mimetype})`);
          try {
            const yandexPath = path.join(
              "myPortfolio",
              "portfolio",
              String(filename)
            );

            await yandexApi.uploadStreamFile(yandexPath, fileStream);

            console.log("✅ Файл успешно загружен");
            uploadDone = true;

            try {
              result.zip = { name: filename, path: yandexPath };
              await db.insert(result);
              uploadDone = true;
              return res.status(200).send("✅ Загружено на Яндекс.Диск");
            } catch (e) {
              console.error("❌ Ошибка при чтении из базы данных:", e.message);
              return res.status(500).send("Ошибка при чтении из базы данных.");
            }
          } catch (err) {
            console.error(
              "❌ Ошибка загрузки:",
              err.response?.data || err.message
            );
            return res.status(500).send("❌ Ошибка при загрузке");
          }
        }
      );

      busboy.on("finish", async () => {
        if (!uploadDone) {
          console.error("❌ Файл не был передан");
          // if (!res.headersSent) {
          //   return res.status(400).send("❌ Файл не был передан");
          // }
        }
      });

      req.pipe(busboy);
    } catch (e) {
      console.error("❌ Ошибка при загрузке архива:", e.message);
      res.status(500).send("Ошибка при загрузке архива.");
    }
  }

  async uploadZipFileYandexStream(req, res) {
    try {
      const idPerent = req.query.id;

      const busboy = new Busboy({ headers: req.headers });

      let result;
      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (e) {
        console.error("❌ Ошибка при запросе к базе данных:", e.message);
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      let uploadDone = false;
      let fileUploadPromise = null; // Переменная для отслеживания завершения загрузки файла

      busboy.on(
        "file",
        async (fieldname, fileStream, filename, encoding, mimetype) => {
          console.log("Имя поля:", fieldname);
          console.log(`📥 Получен файл: ${filename} (${mimetype})`);

          fileUploadPromise = new Promise(async (resolve, reject) => {
            try {
              const yandexPath = path.join(
                "myPortfolio",
                "portfolio",
                String(result.index),
                String(filename)
              );

              await yandexApi.uploadStreamFile(yandexPath, fileStream);
              console.log("✅ Файл успешно загружен");

              result.zip = { name: filename, path: yandexPath };
              await db.insert(result);

              uploadDone = true;
              resolve(); // Успешное завершение загрузки
            } catch (err) {
              console.error(
                "❌ Ошибка загрузки:",
                err.response?.data || err.message
              );
              reject(err); // Ошибка при загрузке
            }
          });
        }
      );

      busboy.on("finish", async () => {
        try {
          if (fileUploadPromise) {
            await fileUploadPromise; // Дожидаемся завершения загрузки
            if (uploadDone) {
              return res.status(200).send("✅ Загружено на Яндекс.Диск");
            }
          }
          console.error("❌ Файл не был передан");
          return res.status(400).send("❌ Файл не был передан");
        } catch (e) {
          console.error("❌ Ошибка при завершении обработки:", e.message);
          return res.status(500).send("Ошибка при завершении обработки.");
        }
      });

      req.pipe(busboy);
    } catch (e) {
      console.error("❌ Ошибка при загрузке архива:", e.message);
      res.status(500).send("Ошибка при загрузке архива.");
    }
  }

  async uploadZipFileYandexStreamMin(req, res) {
    try {
      const idPerent = req.query.id;

      const maxWidth = 1920;
      const maxHeight = 1080;

      const filesFailed = [];

      const busboy = new Busboy({ headers: req.headers });

      let result;
      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (error) {
        console.error("❌ Ошибка при запроса к базе данных:", error.message);
        return res.status(500).send("Ошибка при чтении из базы данных.");
      }

      let uploadDone = false;

      busboy.on(
        "file",
        async (fieldname, fileStream, filename, encoding, mimetype) => {
          console.log("Имя поля для min:", fieldname);
          console.log(`📥 Получен файл для min: ${filename} (${mimetype})`);
          try {
            const filenameMin = `${
              path.parse(filename).name
            }_Mini${path.extname(filename)}`;
            const yandexPathMini = path.join(
              "myPortfolio",
              "portfolio",
              String(result.index),
              String(filenameMin)
            );

            console.log("Пробуем создать поток");
            const archiveStream = unzipper.Parse();

            fileStream.pipe(archiveStream); // Принимаем поток напрямую

            const zipStream = new PassThrough();
            const archive = archiver("zip", { zlib: { level: 7 } });

            archive.pipe(zipStream);

            const fileProcessingPromises = [];

            uploadDone = true;

            archiveStream.on("entry", (file) => {
              if (file.type === "File") {
                const processFile = async () => {
                  try {
                    let fileName = path.basename(file.path); // Получаем только имя файла

                    if (/\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
                      // Обрабатываем изображение
                      const chunks = [];
                      file.on("data", (chunk) => chunks.push(chunk));

                      await new Promise((resolve) => file.on("end", resolve));

                      const buffer = Buffer.concat(chunks);
                      const compressedBuffer = await sharp(buffer)
                        .resize({
                          width: maxWidth,
                          height: maxHeight,
                          fit: "inside",
                        })
                        .toBuffer();
                      archive.append(compressedBuffer, { name: fileName });
                    } else {
                      // Обычные файлы

                      const chunks = [];
                      file.on("data", (chunk) => chunks.push(chunk));
                      await new Promise((resolve) => file.on("end", resolve));
                      const buffer = Buffer.concat(chunks);
                      archive.append(buffer, { name: fileName });
                    }
                  } catch (error) {
                    console.error(
                      `❌ Ошибка при обработке файла ${file.path}:`,
                      error.message
                    );
                    filesFailed.push({ file: file.path, error: error.message });
                  }
                };

                fileProcessingPromises.push(processFile());
              } else {
                file.autodrain();
              }
            });

            archiveStream.on("close", async () => {
              try {
                await Promise.allSettled(fileProcessingPromises);

                console.log(
                  "✅ Распаковка завершена. Начинаем загрузку на Яндекс.Диск."
                );

                const uploadPromise = yandexApi.uploadStreamFile(
                  yandexPathMini,
                  zipStream
                );

                archive.finalize(); // Теперь сразу финализируем архив, а параллельно начинается загрузка

                await uploadPromise;

                result.zipMIn = { name: filenameMin, path: yandexPathMini };
                await db.insert(result);

                return res.status(200).send("✅ Архив загружен на Яндекс.Диск");
              } catch (error) {
                console.error(
                  "❌ Ошибка при завершении обработки файлов:",
                  error.message
                );
                return res
                  .status(500)
                  .send("Ошибка при завершении обработки файлов.");
              }
            });

            archiveStream.on("error", (err) => {
              console.error(
                "❌ Ошибка загрузки archiveStream:",
                err.response?.data || err.message
              );
              return res.status(500).send("❌ Ошибка при загрузке");
            });
          } catch (err) {
            console.error(
              "❌ Ошибка загрузки:",
              err.response?.data || err.message
            );
            return res.status(500).send("❌ Ошибка при загрузке");
          }
        }
      );

      busboy.on("finish", async () => {
        // if (!uploadDone) {
        //   return res.status(400).send("❌ Файл не был передан");
        // }
      });

      req.pipe(busboy);
    } catch (error) {
      console.error("❌ Ошибка при загрузке архива:", error.message);
      return res.status(500).send("Ошибка при загрузке архива.");
    }
  }

  async uploadZipFileYandexNoStream(req, res) {
    try {
      const idPerent = req.query.id;
      let file = req.files.file;
      let result;

      console.log("Функция начинает отработку");

      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: idPerent,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (error) {
        console.error("❌ Ошибка при запроса к базе данных:", error.message);
        return res.status(500).send("Ошибка при запроса к базе данных.");
      }

      const yandexPath = path.join(
        "myPortfolio",
        "portfolio",
        String(file.name)
      );

      try {
        yandexApi.uploadFile(yandexPath, file);

        result.zip = { name: file.name, path: yandexPath };
        await db.insert(result);

        return res.status(200).send("✅ Загружено на Яндекс.Диск");
      } catch (error) {
        console.error("❌ Ошибка при загрке на Яндекс Диск:", error.message);
        return res.status(500).send("Ошибка при загрузке архива.");
      }
    } catch (error) {
      console.error("❌ Ошибка при загрузке архива:", error.message);
      return res.status(500).send("Ошибка при загрузке архива.");
    }
  }

  async deleteZipFileNoStream(req, res) {
    try {
      const id = req.query.id;
      let result;

      console.log("Начинаем процесс удаления");

      try {
        const { rows } = await db.view(dirIdDesign, dirIdIndexName, {
          key: id,
          include_docs: true,
        });

        if (rows.length != 0) {
          result = rows[0].doc;
        } else {
          return res.status(500).send("Ошибка при чтении из базы данных.");
        }
      } catch (error) {
        console.error("Ошибка при запросе в бд:", error.message);
        return res.status(500).send("Ошибка при запросе в бд!");
      }

      try {
        await yandexApi.deleteFile(result.zip?.path);

        await yandexApi.deleteFile(result.zipMIn?.path);
        result.zipMIn = "";
        result.zip = "";
        await db.insert(result);
        return res.status(200).send("✅ Удалено");
      } catch (error) {
        console.error("Ошибка при удалении архива:", error.message);
        return res.status(500).send("Ошибка при удалении архива!");
      }
    } catch (error) {
      return res.status(500).send("Ошибка при удалении архива!");
    }
  }
}

module.exports = new FileController();
