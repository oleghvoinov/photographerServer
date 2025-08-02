const axios = require("axios");
const fs = require("fs");
const path = require("path");

const YANDEX_DISK_API = "https://cloud-api.yandex.net/v1/disk";
const TOKEN = "y0_AgAAAAA3u2vTAAzrBQAAAAEbieltAACq6CWWtPhIUbvovNT85gZiSuuzRg"; // Заменить на полученный токен

const api = axios.create({
  baseURL: YANDEX_DISK_API,
  headers: { Authorization: `OAuth ${TOKEN}` },
});

class YandexApi {
  async getToken(authCode) {
    try {
      const response = await axios.post(
        "https://oauth.yandex.ru/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          client_id: "ce5ed776c1534232962f733cbbbc1085",
          client_secret: "912620beb8584d7d93e21e0971290e55",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      console.log("Твой токен:", response.data.access_token);
    } catch (error) {
      console.error(
        "Ошибка получения токена:",
        error.response?.data || error.message
      );
    }
  }

  async uploadStreamFile(diskPath, fileStream) {
    try {
      await this.createFoldersForFile(diskPath);

      const { data } = await api.get(`/resources/upload`, {
        params: { path: diskPath, overwrite: true },
      });

      await axios.put(data.href, fileStream, {
        headers: { "Content-Type": "application/octet-stream" },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      console.log("Файл успешно загружен:", diskPath);
      return { success: true, message: "Файл загружен" };
    } catch (error) {
      console.error(
        "Ошибка при загрузке:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async uploadFile(diskPath, file) {
    try {
      await this.createFoldersForFile(diskPath);
      // Получаем ссылку для загрузки
      const { data } = await api.get(`/resources/upload`, {
        params: { path: diskPath, overwrite: true },
      });

      // Загружаем файл
      await axios.put(data.href, file.data, {
        headers: { "Content-Type": file.mimetype }, // MIME-тип файла
      });

      console.log("Файл успешно загружен:", diskPath);
      return { success: true, message: "Файл загружен" };
    } catch (error) {
      console.error(
        "Ошибка при загрузке:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async deleteFile(folderPath, permanently = true) {
    try {
      const { data } = await api.delete("/resources", {
        params: { path: folderPath, permanently },
      });
      console.log(`Папка удалена: ${folderPath}`);
      return data;
    } catch (error) {
      console.error(
        "Ошибка при удалении папки:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async downloadFile(res, req) {
    const { path, name } = req.query;

    try {
      const { data } = await api.get(`/resources/download`, {
        params: { path: path },
      });

      const response = await axios.get(data.href, { responseType: "stream" });

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${name || "file.zip"}"`
      );
      response.data.pipe(res);
    } catch (err) {
      console.error("Ошибка прокси-скачивания:", err.message);
      res.status(500).send("Не удалось скачать файл.");
    }
  }

  // Проверка + создание папок
  async createFoldersForFile(fullPath) {
    const folderPath = path.dirname(fullPath); // Получаем путь без имени файла
    const folders = folderPath.split("/"); // Разбиваем путь на части
    let currentPath = "";

    for (const folder of folders) {
      currentPath = currentPath ? `${currentPath}/${folder}` : folder;
      const exists = await this.checkFolderExists(currentPath);
      if (!exists) {
        await this.createFolder(currentPath);
      }
    }
  }

  // Проверка существования папки
  async checkFolderExists(folderPath) {
    try {
      await api.get("/resources", {
        params: { path: folderPath },
      });
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  // Создание папки
  async createFolder(folderPath) {
    try {
      await api.put("/resources", null, {
        params: { path: folderPath },
      });
      console.log(`Папка ${folderPath} создана.`);
    } catch (error) {
      console.error(
        "Ошибка при создании папки:",
        error.response?.data || error.message
      );
    }
  }
}

module.exports = new YandexApi();
