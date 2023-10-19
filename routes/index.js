"use strict";
var express = require("express");
var router = express.Router();
const stock_read_log = require("../models/stock_read_log");
const FileSystem = require("fs");

router.use("/export-data", async (req, res) => {
  const list = await stock_read_log
    .aggregate([
      {
        $match: {},
      },
    ])
    .exec();

  FileSystem.writeFile(
    "./stock_read_log.json",
    JSON.stringify(list),
    (error) => {
      if (error) throw error;
    }
  );

  console.log("stock_read_log.json exported!");
  res.json({ statusCode: 1, message: "stock_read_log.json exported!" });
});

router.use("/import-data", async (req, res) => {
  FileSystem.readFile("./stock_read_log.json", async (error, data) => {
    if (error) throw error;

    const list = JSON.parse(data);

    await stock_read_log.deleteMany({});

    await stock_read_log.insertMany(list);

    console.log("stock_read_log.json imported!");
    res.json({ statusCode: 1, message: "stock_read_log.json imported!" });
  });
});

router.use("/edit-repacking-data", async (req, res, next) => {
  // Silahkan dikerjakan disini.
  try {
    const { company_id, payload, reject_qr_list, new_qr_list } = req.body;

    if (!company_id || !payload || !reject_qr_list || !new_qr_list)
      throw new Error("Fill All Field");

    const newList = new_qr_list.map((e) => e.payload);
    const rejectedList = reject_qr_list.map((e) => e.payload);

    let [findNewList, findStock] = await Promise.all([
      stock_read_log.find({
        "qr_list.payload": { $in: newList },
      }),
      stock_read_log.findOne({ company_id, payload }),
    ]);

    if (!findStock) throw new Error("Stock Not Found");

    findStock.qr_list = findStock.qr_list.filter(
      (e) => !rejectedList.includes(e.payload)
    );

    // if status needed to be change to rejected(1), uncomment code below and comment line 63-65
    // findStock.qr_list.forEach((e) => {
    //   if (rejectedList.includes(e.payload)) e.status_qc = 1;
    // });

    const updateStock = [];
    for (let i = 0; i < findNewList.length; i++) {
      const el = findNewList[i];
      const excludeQty = el.qr_list.filter((e) => !newList.includes(e.payload));
      const includeQty = el.qr_list.filter((e) => newList.includes(e.payload));

      findStock.qr_list = [...findStock.qr_list, ...includeQty];

      updateStock.push(
        stock_read_log.updateOne(
          { payload: el.payload },
          { $set: { qr_list: excludeQty, qty: excludeQty.length } }
        )
      );
    }

    findStock.qty = findStock.qr_list.length;
    updateStock.push(findStock.save());

    await Promise.all(updateStock);

    res.json({
      statusCode: 1,
      message: "stock_read_log.json edited!",
      findStock,
      findNewList,
    });
  } catch (error) {
    next(error);
  }
});

router.use("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

module.exports = router;
