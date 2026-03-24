var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel, uploadCsv } = require("../utils/uploadHandler");
let exceljs = require("exceljs");
let path = require("path");
let fs = require("fs");
let readline = require("readline");
let mongoose = require("mongoose");
let productModel = require("../schemas/products");
let inventoryModel = require("../schemas/inventories");
let categoryModel = require("../schemas/categories");
let slugify = require("slugify");
let roleModel = require("../schemas/roles");
let userController = require("../controllers/users");
let mailHandler = require("../utils/mailHandler");

router.post("/an_image", uploadImage.single("file"), function (req, res, next) {
  if (!req.file) {
    res.send({
      message: "file khong duoc rong",
    });
  } else {
    res.send({
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
    });
  }
});
router.get("/:filename", function (req, res, next) {
  let filename = path.join(__dirname, "../uploads", req.params.filename);
  res.sendFile(filename);
});

router.post(
  "/multiple_images",
  uploadImage.array("files", 5),
  function (req, res, next) {
    if (!req.files) {
      res.send({
        message: "file khong duoc rong",
      });
    } else {
      // res.send({
      //     filename: req.file.filename,
      //     path: req.file.path,
      //     size: req.file.size
      // })

      res.send(
        req.files.map((f) => {
          return {
            filename: f.filename,
            path: f.path,
            size: f.size,
          };
        }),
      );
    }
  },
);

router.post(
  "/excel",
  uploadExcel.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      res.send({
        message: "file khong duoc rong",
      });
    } else {
      //wookbook->worksheet->row/column->cell
      let workBook = new exceljs.Workbook();
      let filePath = path.join(__dirname, "../uploads", req.file.filename);
      await workBook.xlsx.readFile(filePath);
      let worksheet = workBook.worksheets[0];
      let result = [];

      let categoryMap = new Map();
      let categories = await categoryModel.find({});
      for (const category of categories) {
        categoryMap.set(category.name, category._id);
      }

      let products = await productModel.find({});
      let getTitle = products.map((p) => p.title);
      let getSku = products.map((p) => p.sku);

      for (let index = 2; index <= worksheet.rowCount; index++) {
        let errorsRow = [];
        const element = worksheet.getRow(index);
        let sku = element.getCell(1).value;
        let title = element.getCell(2).value;
        let category = element.getCell(3).value;
        let price = Number.parseInt(element.getCell(4).value);
        let stock = Number.parseInt(element.getCell(5).value);

        if (price < 0 || isNaN(price)) {
          errorsRow.push("price khong duoc nho hon 0 va la so");
        }
        if (stock < 0 || isNaN(stock)) {
          errorsRow.push("stock khong duoc nho hon 0 va la so");
        }
        if (!categoryMap.has(category)) {
          errorsRow.push("category khong hop le");
        }
        if (getSku.includes(sku)) {
          errorsRow.push("sku da ton tai");
        }
        if (getTitle.includes(title)) {
          errorsRow.push("title da ton tai");
        }

        if (errorsRow.length > 0) {
          result.push({
            success: false,
            data: errorsRow,
          });
          continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction();
        try {
          let newProducts = new productModel({
            sku: sku,
            title: title,
            slug: slugify(title, {
              replacement: "-",
              lower: false,
              remove: undefined,
            }),
            description: title,
            category: categoryMap.get(category),
            price: price,
          });
          await newProducts.save({ session });
          let newInventory = new inventoryModel({
            product: newProducts._id,
            stock: stock,
          });
          await newInventory.save({ session });
          await newInventory.populate("product");
          await session.commitTransaction();
          await session.endSession();
          getTitle.push(title);
          getSku.push(sku);
          result.push({
            success: true,
            data: newInventory,
          });
        } catch (error) {
          await session.abortTransaction();
          await session.endSession();
          result.push({
            success: false,
            data: error.message,
          });
        }
      }
      fs.unlinkSync(filePath);
      result = result.map((r, index) => {
        if (r.success) {
          return {
            [index + 1]: r.data,
          };
        } else {
          return {
            [index + 1]: r.data.join(","),
          };
        }
      });
      res.send(result);
    }
  },
);

// ===================== IMPORT USERS FROM CSV =====================
function generatePassword(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

router.post(
  "/users",
  uploadCsv.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      return res.status(400).send({ message: "Vui long chon file CSV" });
    }

    const filePath = path.join(__dirname, "../uploads", req.file.filename);

    try {
      // Tim role "user"
      const userRole = await roleModel.findOne({
        name: "user",
        isDeleted: false,
      });
      if (!userRole) {
        fs.unlinkSync(filePath);
        return res
          .status(400)
          .send({
            message: 'Khong tim thay role "user". Vui long tao role truoc.',
          });
      }

      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let isHeader = true;
      const result = [];

      for await (const line of rl) {
        if (isHeader) {
          isHeader = false;
          continue;
        }
        const parts = line.split(",").map((s) => s.trim());
        const username = parts[0];
        const email = parts[1];
        if (!username || !email) continue;

        const password = generatePassword(16);
        try {
          const newUser = await userController.CreateAnUser(
            username,
            password,
            email,
            userRole._id,
            null,
          );
          await mailHandler.sendPasswordMail(email, username, password);
          result.push({
            row: username,
            success: true,
            data: { _id: newUser._id, username, email },
          });
        } catch (err) {
          result.push({ row: username, success: false, data: err.message });
        }
      }

      fs.unlinkSync(filePath);
      res.send(result);
    } catch (err) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(500).send({ message: err.message });
    }
  },
);

module.exports = router;
