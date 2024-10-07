const mongoose = require("mongoose");
const moment = require("moment-timezone");
const config = require("../../config/auth.config");
const db = require("../../models");
const User = db.user;
const Ticket = db.ticket;
const WinningNumber = db.winningNumber;
const Lottery = db.lotteryCategory;
const Limits = db.limits;
const LimitCalc = db.limitCalc;
const BlockNumber = db.blockNumber;
const SpecificLimits = db.specificLimits;

const zlib = require("zlib");

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

// Set the timezone to Haiti
const haitiTimezone = "America/Port-au-Prince";

exports.signIn = async (req, res) => {
  try {
    const { imei, password } = req.body;

    const user = await User.findOne({ imei }).populate("subAdminId");

    if (!user) {
      res.send(encoding({ success: false, message: "User not found!" }));
      return;
    }

    if (!user.isActive) {
      res.send(encoding({ success: false, message: "This user locked now!" }));
      return;
    }

    if (!user.subAdminId.isActive) {
      res.send(encoding({
        success: false,
        message: "Votre compagnie est deconnecée",
      }));
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.send(encoding({ success: false, message: "Mot de passe incorrecte" }));
      return;
    }

    var token = jwt.sign({ id: user.id }, config.secret, {
      expiresIn: "10h",
    });

    req.session.token = token;
    res.send(
      encoding({
        success: true,
        token: token,
        userName: user.userName,
        companyName: user.subAdminId.companyName,
        phoneNumber: user.subAdminId.phoneNumber,
        address: user.subAdminId.address,
        sellerId: user._id,
        subAdminId: user.subAdminId._id,
      })
    );
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: err });
  }
};

exports.signOut = async (req, res) => {
  try {
    req.session = null;
    res.send({ success: true, message: "You've been signed out!" });
  } catch (err) {
    this.next(err);
  }
};

//Create ticket
exports.newTicket = async (req, res) => {
  try {
    const { lotteryCategoryName, sellerId } = req.body;
    const numbers = JSON.parse(req.body.numbers);
    const today = moment().tz(haitiTimezone).format("yyyy-MM-DD");
    const currentTime = moment().tz(haitiTimezone).format("HH:mm");

    const lotInfo = await Lottery.findOne({ lotteryName: lotteryCategoryName });

    if (
      moment(currentTime, "HH:mm").isAfter(
        moment(lotInfo.startTime, "HH:mm")
      ) &&
      moment(currentTime, "HH:mm").isBefore(moment(lotInfo.endTime, "HH:mm"))
    ) {
      const { success, error, limit_data, block_data, new_numbers } =
        await requestTicketCheck(lotteryCategoryName, sellerId, numbers);

      if (!success) {
        console.log("ticket check error: ", error);
        return res.send(encoding({
          success: false,
          message: "ticket save failed! try again!",
        }));
      }

      if (new_numbers.length > 0) {
        const ticket = new Ticket({
          seller: sellerId,
          lotteryCategoryName,
          numbers: new_numbers,
          date: today,
          isDelete: false,
        });

        await ticket.save((err, savedTicket) => {
          if (err) {
            console.log("new ticket data error :", err);
            res.send(encoding({
              success: false,
              message: "new ticket create failed! please try again!",
            }));
            return;
          } else {
            const newId = savedTicket.ticketId;
            res.send(encoding({
              success: true,
              message: "success",
              ticketId: newId,
              numbers: new_numbers,
              limit_data,
              block_data,
            }));
            return;
          }
        });
      } else {
        res.send(encoding({
          success: true,
          message: "you cant create ticket!",
          numbers: new_numbers,
          limit_data,
          block_data,
        }));
        return;
      }
    } else {
      res.send(encoding({
        success: false,
        message: `Haiti local time now: ${currentTime}. \n Time is up!. Sorry you cann't create ticket.`,
      }));
      return;
    }
  } catch (err) {
    console.log(err);
    res.status(500).send(encoding({ message: err }));
  }
};
// Read
exports.getTicket = async (req, res) => {
  try {
    let { fromDate, toDate, lotteryCategoryName } = req.query;
    seller = mongoose.Types.ObjectId(req.userId);
    const query = { isDelete: false };
    if (fromDate && toDate) {
      query.date = { $gte: fromDate, $lte: toDate };
    }
    if (seller != "") {
      query.seller = seller;
    }
    if (lotteryCategoryName != "All Category") {
      query.lotteryCategoryName = lotteryCategoryName;
    }
    const ticketsObj = await Ticket.find(query, {
      _id: 1,
      date: 1,
      ticketId: 1,
      lotteryCategoryName: 1,
    });
    res.send({ success: true, data: ticketsObj });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
// Read
exports.getTicketNumbers = async (req, res) => {
  try {
    let { id } = req.query;
    const ticketsObj = await Ticket.findOne(
      { _id: mongoose.Types.ObjectId(id) },
      { numbers: 1 }
    );
    res.send({ success: true, data: ticketsObj.numbers });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
//get Win Ticket
exports.matchWinningNumbers = async (req, res) => {
  try {
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const lotteryCategoryName = req.query.lotteryCategoryName;
    const seller = mongoose.Types.ObjectId(req.userId);

    const query = [];
    query.push({ $eq: ["$lotteryCategoryName", "$$lotteryCategoryName"] });
    query.push({ $eq: ["$date", "$$date"] });

    if (lotteryCategoryName != "All Category") {
      query.push({ $eq: ["$lotteryCategoryName", lotteryCategoryName] });
    }

    const subAdmin = await User.findOne({ _id: seller });

    Ticket.aggregate([
      {
        $match: {
          date: { $gte: new Date(fromDate), $lte: new Date(toDate) },
          seller: seller,
          isDelete: false,
        },
      },
      {
        $lookup: {
          from: "winningnumbers", // The collection name for WinningNumber model
          let: {
            lotteryCategoryName: "$lotteryCategoryName",
            date: "$date",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: query,
                },
              },
            },
          ],
          as: "winningNumbers",
        },
      },
      {
        $lookup: {
          from: "paymentterms",
          let: {
            lotteryCategoryName: "$lotteryCategoryName",
            subAdmin: "$subAdmin",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$lotteryCategoryName", "$$lotteryCategoryName"] },
                    { $eq: ["$subAdmin", subAdmin.subAdminId] },
                  ],
                },
              },
            },
          ],
          as: "paymentTerms",
        },
      },
      {
        $project: {
          seller: 1,
          ticketId: 1,
          date: 1,
          lotteryCategoryName: 1,
          numbers: 1,
          winningNumbers: 1,
          paymentTerms: 1,
        },
      },
      {
        $sort: {
          lotteryCategoryName: 1,
          ticketId: 1,
          date: 1,
        },
      },
    ]).exec((err, result) => {
      if (err) {
        console.log(err);
        res.send({ success: false, message: "not found!" });
      } else {
        const winTicket = [];
        // Process the result
        result.forEach((item) => {
          let numbers = item.numbers;
          if (item.winningNumbers.length == 0) return false;
          let winnumbers = item.winningNumbers[0].numbers;
          let payterms = item.paymentTerms[0].conditions;
          let paidAmount = 0;

          const winGameNumber = [];
          let winTicketFlag = false;

          numbers.forEach((gameNumber) => {
            let winNumberFlag = false;
            winnumbers.forEach((winNumber) => {
              if (
                gameNumber.number === winNumber.number &&
                gameNumber.gameCategory === winNumber.gameCategory
              ) {
                winNumberFlag = true;
                payterms.forEach((term) => {
                  if (
                    term.gameCategory === winNumber.gameCategory &&
                    winNumber.position === term.position
                  ) {
                    paidAmount += gameNumber.amount * term.condition;
                  }
                });
                return;
              }
            });

            if (winNumberFlag) {
              winGameNumber.push({ ...gameNumber, winFlag: true });
              winTicketFlag = true;
            } else {
              winGameNumber.push(gameNumber);
            }
          });

          if (winTicketFlag) {
            winTicket.push({
              ticketId: item.ticketId,
              date: item.date,
              lotteryCategoryName: item.lotteryCategoryName,
              seller: item.seller,
              numbers: winGameNumber,
              paidAmount: paidAmount,
            });
          }
        });
        res.send({ success: true, data: winTicket });
      }
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
};
// Read
exports.getSaleReportsForSeller = async (req, res) => {
  try {
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const lotteryCategoryName = req.query.lotteryCategoryName;
    const seller = mongoose.Types.ObjectId(req.userId);

    const query = [];
    query.push({ $eq: ["$lotteryCategoryName", "$$lotteryCategoryName"] });
    query.push({ $eq: ["$date", "$$date"] });

    const matchStage = {
      $match: {
        date: { $gte: new Date(fromDate), $lte: new Date(toDate) },
        seller: seller,
        isDelete: false,
      },
    };

    if (lotteryCategoryName !== "All Category") {
      query.push({ $eq: ["$lotteryCategoryName", lotteryCategoryName] });
      matchStage.$match.lotteryCategoryName = lotteryCategoryName;
    }

    const seller_db_info = await User.findOne({ _id: seller });

    const result = await Ticket.aggregate([
      matchStage,
      {
        $lookup: {
          from: "paymentterms",
          let: {
            lotteryCategoryName: "$lotteryCategoryName",
            subAdmin: "$subAdmin",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$lotteryCategoryName", "$$lotteryCategoryName"] },
                    { $eq: ["$subAdmin", seller_db_info.subAdminId] },
                  ],
                },
              },
            },
          ],
          as: "paymentTerms",
        },
      },
      {
        $lookup: {
          from: "winningnumbers",
          let: { lotteryCategoryName: "$lotteryCategoryName", date: "$date" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: query,
                },
              },
            },
          ],
          as: "winningNumbers",
        },
      },
      {
        $project: {
          ticketId: 1,
          date: 1,
          lotteryCategoryName: 1,
          numbers: 1,
          winningNumbers: 1,
          paymentTerms: 1,
        },
      },
    ]);

    let sumAmount = 0;
    let paidAmount = 0;

    result.forEach((item) => {
      const numbers = item.numbers;

      // sumAmount += numbers.reduce((total, value) => total + value.amount, 0);

      if (item.winningNumbers.length !== 0 && item.paymentTerms.length !== 0) {
        const winnumbers = item.winningNumbers[0].numbers;
        const payterms = item.paymentTerms[0].conditions;
        numbers.forEach((gameNumber) => {
          winnumbers.forEach((winNumber) => {
            if (
              gameNumber.number === winNumber.number &&
              gameNumber.gameCategory === winNumber.gameCategory
            ) {
              payterms.forEach((term) => {
                if (
                  term.gameCategory === winNumber.gameCategory &&
                  winNumber.position === term.position
                ) {
                  paidAmount += gameNumber.amount * term.condition;
                }
              });
            }
          });

          if (!gameNumber.bonus) {
            sumAmount += gameNumber.amount;
          }
        });
      }
    });

    res.send({ success: true, data: { sum: sumAmount, paid: paidAmount } });
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
};
// Read
exports.readWinningNumber = async (req, res) => {
  try {
    const { lotteryCategoryName, fromDate, toDate } = req.body;
    let winningNumber = null;
    if (lotteryCategoryName == "All Category") {
      winningNumber = await WinningNumber.find({
        date: { $gte: fromDate, $lte: toDate },
      }).sort({ date: 1 });
    } else {
      winningNumber = await WinningNumber.find({
        lotteryCategoryName: lotteryCategoryName,
        date: { $gte: fromDate, $lte: toDate },
      }).sort({ date: 1 });
    }

    if (winningNumber.length == 0) {
      return res.send({ success: false, message: "Winning number not found" });
    }

    const winNumber = [];
    winningNumber.map((item) => {
      let numbers = {};
      item.numbers.map((value) => {
        if (value.gameCategory === "BLT" && value.position === 2) {
          numbers.second = value.number;
        }
        if (value.gameCategory === "BLT" && value.position === 3) {
          numbers.third = value.number;
        }
        if (value.gameCategory === "L3C") {
          numbers.l3c = value.number;
        }
      });

      winNumber.push({
        date: item.date,
        lotteryName: item.lotteryCategoryName,
        numbers: numbers,
      });
    });

    res.send({ success: true, data: winNumber });
  } catch (err) {
    console.log(err.message);
    res.send({ success: false, message: "Server error" });
  }
};

exports.lotteryTimeCheck = async (req, res) => {
  try {
    const lotId = req.query.lotId;
    const currentTime = moment().tz(haitiTimezone).format("HH:mm");
    const lotInfo = await Lottery.findOne({ _id: lotId });

    if (
      moment(currentTime, "HH:mm").isAfter(
        moment(lotInfo.startTime, "HH:mm")
      ) &&
      moment(currentTime, "HH:mm").isBefore(moment(lotInfo.endTime, "HH:mm"))
    ) {
      res.send({
        success: true,
        data: true,
        time: currentTime,
        startTime: lotInfo.startTime,
        endTime: lotInfo.endTime,
      });
      return;
    } else {
      res.send({
        success: true,
        data: false,
        time: currentTime,
        startTime: lotInfo.startTime,
        endTime: lotInfo.endTime,
      });
      return;
    }
  } catch (err) {
    console.log("time check error: ", err);
    res.send({ success: false, data: false });
  }
};

// Delete
exports.deleteTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(
      mongoose.Types.ObjectId(req.params.id)
    );
    if (ticket == null) {
      return res.status(404).send({ message: "Ticket not found" });
    }

    const lotInfo = await Lottery.findOne({
      lotteryName: ticket.lotteryCategoryName,
    });

    const currentTime = moment().tz(haitiTimezone).format("HH:mm");
    const today = moment().tz(haitiTimezone).format("yyyy-MM-DD");

    const limitGameCategoryMapping = {
      "L4C 1": "L4C",
      "L4C 2": "L4C",
      "L4C 3": "L4C",
      "L5C 1": "L5C",
      "L5C 2": "L5C",
      "L5C 3": "L5C",
    };

    if (
      moment(new Date(today), "yyyy-MM-DD").isSame(
        moment(new Date(ticket.date), "YYY-MM-DD"),
        "day"
      ) &&
      moment(currentTime, "HH:mm").isAfter(
        moment(lotInfo.startTime, "HH:mm")
      ) &&
      moment(currentTime, "HH:mm").isBefore(moment(lotInfo.endTime, "HH:mm"))
    ) {
      const sellerId = ticket.seller;
      const subAdminInfo = await User.findOne({ _id: sellerId });
      const lotteryCategoryName = ticket.lotteryCategoryName;
      const numbers = ticket.numbers;
      await Promise.all(
        numbers.map(async (item) => {
          if (!item.bonus) {
            let limitGameCategory =
              limitGameCategoryMapping[item.gameCategory] || item.gameCategory;

            const pipeline = [
              {
                $match: {
                  subAdmin: subAdminInfo.subAdminId,
                  lotteryCategoryName,
                  $or: [
                    {
                      seller: mongoose.Types.ObjectId(sellerId),
                      "limits.gameCategory": limitGameCategory,
                      "limits.gameNumber": item.number,
                    },
                    {
                      "limits.gameCategory": limitGameCategory,
                      "limits.gameNumber": item.number,
                    },
                    {
                      seller: mongoose.Types.ObjectId(sellerId),
                      "limits.gameCategory": limitGameCategory,
                    },
                    {
                      "limits.gameCategory": limitGameCategory,
                    },
                  ],
                },
              },
              {
                $addFields: {
                  limits: {
                    $filter: {
                      input: "$limits",
                      cond: {
                        $or: [
                          {
                            $and: [
                              {
                                $eq: ["$$this.gameCategory", limitGameCategory],
                              },
                              {
                                $eq: ["$$this.gameNumber", item.number],
                              },
                            ],
                          },
                          {
                            $eq: ["$$this.gameCategory", limitGameCategory],
                          },
                        ],
                      },
                    },
                  },
                },
              },
              {
                $project: {
                  limits: 1,
                },
              },
            ];

            const limit = await Limits.aggregate(pipeline);

            await LimitCalc.findOneAndUpdate(
              {
                limitId: limit[0]._id,
                "soldState.gameCategory": limitGameCategory,
                "soldState.gameNumber": item.number,
              },
              {
                $inc: {
                  "soldState.$.soldQuantity": -item.amount,
                },
              },
              { new: true }
            );
          }
        })
      );

      ticket.isDelete = true;
      await ticket.save();
      return res.send({ success: true, message: "Ticket deleted" });
    } else {
      return res.send({
        success: false,
        message: "Ticket time is up! You cann't remove this ticket!",
      });
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: err.message });
  }
};

async function requestTicketCheck(lotteryCategoryName, sellerId, numbers) {
  try {
    const subAdminInfo = await User.findOne({ _id: sellerId }).populate(
      "subAdminId"
    );

    const blockNumberQuery = {
      subAdmin: subAdminInfo.subAdminId,
      lotteryCategoryName,
      $or: numbers.map((item) => ({
        gameCategory: item.gameCategory,
        number: item.number,
      })),
    };

    const block_data = await BlockNumber.find(blockNumberQuery, {
      gameCategory: 1,
      number: 1,
    });

    const matchedNumbers = new Set();

    for (const blockItem of block_data) {
      for (let i = numbers.length - 1; i >= 0; i--) {
        const item = numbers[i];
        if (
          blockItem.gameCategory === item.gameCategory &&
          blockItem.number === item.number
        ) {
          matchedNumbers.add(i);
        }
      }
    }

    const limitGameCategoryMapping = {
      "L4C 1": "L4C",
      "L4C 2": "L4C",
      "L4C 3": "L4C",
      "L5C 1": "L5C",
      "L5C 2": "L5C",
      "L5C 3": "L5C",
    };

    const limit_data = [];
    const new_numbers = [];
    let acceptedAmountSum = 0;

    for (let index = 0; index < numbers.length; index++) {
      const item = numbers[index];
      if (!matchedNumbers.has(index)) {
        let limitGameCategory =
          limitGameCategoryMapping[item.gameCategory] || item.gameCategory;
        const pipeline1 = [
          {
            $match: {
              subAdmin: subAdminInfo.subAdminId._id,
              lotteryCategoryName,
              $or: [
                {
                  seller: mongoose.Types.ObjectId(sellerId),
                  "limits.gameCategory": limitGameCategory,
                  "limits.gameNumber": item.number,
                },
                {
                  "limits.gameCategory": limitGameCategory,
                  "limits.gameNumber": item.number,
                },
              ],
            },
          },
          {
            $addFields: {
              limits: {
                $filter: {
                  input: "$limits",
                  cond: {
                    $and: [
                      {
                        $eq: ["$$this.gameCategory", limitGameCategory],
                      },
                      {
                        $eq: ["$$this.gameNumber", item.number],
                      },
                    ],
                  },
                },
              },
            },
          },
          {
            $project: {
              limits: 1,
            },
          },
        ];

        const pipeline2 = [
          {
            $match: {
              subAdmin: subAdminInfo.subAdminId._id,
              lotteryCategoryName,
              $or: [
                {
                  seller: mongoose.Types.ObjectId(sellerId),
                  "limits.gameCategory": limitGameCategory,
                },
                {
                  "limits.gameCategory": limitGameCategory,
                },
              ],
            },
          },
          {
            $addFields: {
              limits: {
                $filter: {
                  input: "$limits",
                  cond: {
                    $eq: ["$$this.gameCategory", limitGameCategory],
                  },
                },
              },
            },
          },
          {
            $project: {
              limits: 1,
            },
          },
        ];

        let limit = null;
        limit = await SpecificLimits.aggregate(pipeline1);
        if (limit.length == 0) {
          limit = await Limits.aggregate(pipeline2);
        }

        if (limit.length > 0) {
          let limitCalc = await LimitCalc.findOne(
            {
              limitId: limit[0]._id,
              "soldState.gameCategory": limitGameCategory,
              "soldState.gameNumber": item.number,
            },
            {
              "soldState.$": 1,
            }
          );

          let restQuantity = null;
          let addAmount = null;

          if (limitCalc) {
            restQuantity =
              limit[0].limits[0]?.limitsButs -
              limitCalc.soldState[0]?.soldQuantity;

            if (item.amount > restQuantity) {
              limit_data.push({ ...item, availableAmount: restQuantity });
              addAmount = restQuantity;
            } else {
              addAmount = item.amount;
            }

            if (addAmount > 0) {
              await LimitCalc.findOneAndUpdate(
                {
                  limitId: limit[0]._id,
                  "soldState.gameCategory": limitGameCategory,
                  "soldState.gameNumber": item.number,
                },
                {
                  $inc: {
                    "soldState.$.soldQuantity": addAmount,
                  },
                },
                { new: true }
              );
            }
          } else {
            if (item.amount > limit[0].limits[0]?.limitsButs) {
              limit_data.push({
                ...item,
                availableAmount: limit[0].limits[0]?.limitsButs,
              });

              addAmount = limit[0].limits[0]?.limitsButs;
            } else {
              addAmount = item.amount;
            }
            limitCalc = await LimitCalc.findOne({ limitId: limit[0]._id });

            if (limitCalc) {
              limitCalc.soldState.push({
                gameCategory: limitGameCategory,
                gameNumber: item.number,
                soldQuantity: addAmount,
              });

              await limitCalc.save();
            } else {
              const newLimitCalc = new LimitCalc({
                limitId: limit[0]._id,
                soldState: [
                  {
                    gameCategory: limitGameCategory,
                    gameNumber: item.number,
                    soldQuantity: addAmount,
                  },
                ],
              });

              await newLimitCalc.save();
            }
          }

          if (addAmount > 0) {
            new_numbers.push({ ...item, amount: addAmount, bonus: false });
          }
        } else {
          new_numbers.push({ ...item, bonus: false });
        }

        acceptedAmountSum += item.amount;
      }
    }

    if (subAdminInfo.subAdminId.bonusFlag && new_numbers.length > 0) {
      if (acceptedAmountSum >= 50 && acceptedAmountSum < 250) {
        const bonus_1 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_2 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_1,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_2,
          amount: 1,
          bonus: true,
        });
      } else if (acceptedAmountSum >= 250 && acceptedAmountSum < 1000) {
        const bonus_1 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_2 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_3 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_4 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_1,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_2,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_3,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_4,
          amount: 1,
          bonus: true,
        });
      } else if (acceptedAmountSum >= 1000) {
        const bonus_1 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_2 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_3 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_4 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        const bonus_5 =
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0") +
          "×" +
          Math.floor(Math.random() * 99)
            .toString()
            .padStart(2, "0");
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_1,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_2,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_3,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_4,
          amount: 1,
          bonus: true,
        });
        new_numbers.push({
          gameCategory: "MRG",
          number: bonus_5,
          amount: 1,
          bonus: true,
        });
      }
    }

    return { success: true, block_data, limit_data, new_numbers };
  } catch (error) {
    console.log("ticket check error: ", error);
    return { success: false, error: error };
  }
}

// Read
exports.getDeletedTicket = async (req, res) => {
  try {
    let { fromDate, toDate, lotteryCategoryName } = req.query;
    seller = mongoose.Types.ObjectId(req.userId);
    const query = { isDelete: true };
    if (fromDate && toDate) {
      query.date = { $gte: fromDate, $lte: toDate };
    }
    if (seller != "") {
      query.seller = seller;
    }
    if (lotteryCategoryName != "All Category") {
      query.lotteryCategoryName = lotteryCategoryName;
    }
    const ticketsObj = await Ticket.find(query, {
      _id: 1,
      date: 1,
      ticketId: 1,
      lotteryCategoryName: 1,
    });
    res.send({ success: true, data: ticketsObj });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Delete
exports.deleteTicketForever = async (req, res) => {
  try {
    await Ticket.deleteOne({ _id: mongoose.Types.ObjectId(req.params.id) });
    return res.send({ success: true, message: "Ticket deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: err.message });
  }
};

// Ticket Replay
exports.replayTicket = async (req, res) => {
  try {
    const { tId, date, lottery, newLottery} = req.body;

    // lottery time check
    const currentTime = moment().tz(haitiTimezone).format("HH:mm");
    const lotInfo = await Lottery.findOne({ lotteryName: newLottery });
    if (
      moment(currentTime, "HH:mm").isAfter(
        moment(lotInfo.startTime, "HH:mm")
      ) &&
      moment(currentTime, "HH:mm").isBefore(moment(lotInfo.endTime, "HH:mm"))
    ) {
      const match = await Ticket.findOne({date: date, ticketId: tId, lotteryCategoryName: lottery, seller: req.userId}, {numbers: 1});

      if(match) {
        res.send(encoding({
          success: true,
          numbers: match.numbers
        }))
      } else {
        res.send(encoding({
          success: false,
          message: "Not Found Data!"
        }))
      }

    } else {
      res.send(encoding({
        success: false,
        message: "Lottery time check failed!"
      }));
      return;
    }
  } catch {
    res.send({success: false, data: false});
  }
}


// This is check blocked seller. like this middleware.
exports.isActive = (req, res, next) => {
  User.findById(req.userId).exec((err, user) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }
    if (user && user.isActive === true) {
      next();
      return;
    }
    
    res.send(encoding({success: false, message: "Unauthorized!"}));
    return;
  });
};

function encoding(data) {
  return zlib.gzipSync(JSON.stringify(data));
}