const fs = require("fs");
const config = require("config");
const path = require("path");
const sharp = require("sharp");

const pathForBuild = path.join(__dirname, "..", "uploads");
//const pathForBuild = path.join("/var", "www", "uploads");

class FileService {
  createProject(name) {
    const filePath = path.join(pathForBuild, "portfolio", String(name));

    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(filePath)) {
          fs.mkdirSync(filePath, { recursive: true });
          fs.mkdirSync(path.join(filePath, "prewie"), { recursive: true });
          fs.mkdirSync(path.join(filePath, "children"), { recursive: true });

          return resolve({ message: "File was created" });
        } else {
          let error = new Error("File was created");
          return reject({ message: "File already exist" });
        }
      } catch (e) {
        console.log(e);
        return reject({ message: "File error" });
      }
    });
  }
  getPathMainPage(file) {
    return path.join(pathForBuild, "mainPage", String(file.name));
  }
  async deleteFileMainPage(file) {}

  deleteDirRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
      fs.readdirSync(folderPath).forEach((file) => {
        const curPath = path.join(folderPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          this.deleteDirRecursive(curPath); // Рекурсивно удаляем подпапки
        } else {
          console.log("Удаляем файлы: ", curPath);
          fs.unlinkSync(curPath); // Удаляем файлы
        }
      });
      console.log("Удаляем папки: ", folderPath);
      fs.rmdirSync(folderPath, { force: true });
    }
  }

  async convertAndCompressImage(fileImage, maxWidth = 1920, maxHeight = 1080) {
    try {
      const outputData = await sharp(fileImage.data)
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: "inside",
        })
        .toBuffer();
      console.log(fileImage);
      fileImage.data = outputData;
      // fileImage.name = fileImage.name.split(".")[0] + ".webp";
      // fileImage.mimetype = "image/webp";
      fileImage.size = outputData.length;

      return fileImage;
    } catch (error) {
      console.error(`❌ Ошибка при конвертации изображения: ${error.message}`);
      throw error;
    }
  }

  async convertAndCompressImageToWebp(
    fileImage,
    maxWidth = 1920,
    maxHeight = 1080
  ) {
    try {
      const outputData = await sharp(fileImage.data)
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: "inside",
          withoutEnlargement: true, // Можно добавить, чтобы не увеличивало
        })
        .toFormat("webp")
        .toBuffer();

      fileImage.data = outputData;
      fileImage.name = fileImage.name.replace(/\.[^/.]+$/, "") + ".webp";
      fileImage.mimetype = "image/webp";
      fileImage.size = outputData.length;

      return fileImage;
    } catch (error) {
      console.error(`❌ Ошибка при конвертации изображения: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new FileService();
