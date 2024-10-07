const db = require("../../models");
const User = db.user;

var bcrypt = require("bcryptjs");

// Read
exports.getseller = async (req, res) => {
  try {
    // Fetch sellers and populate the supervisor's name
    const users = await User.find({ subAdminId: req.userId, role: "seller" })
      .populate("superVisorId", "userName") // Populate supervisor's userName field
      .exec();

    // Fetch sub-admin details (companyName, bonusFlag)
    const subadmin = await User.findOne(
      { _id: req.userId },
      { companyName: 1, bonusFlag: 1 }
    );

    res.send({
      success: true,
      users: users.map((user) => ({
        _id: user._id,
        userName: user.userName,
        superVisorId: user.superVisorId?._id || null, // Ensure superVisorId is present
        superVisorName: user.superVisorId?.userName || "N/A", // Display supervisor's name, fallback to N/A
        isActive: user.isActive,
        imei: user.imei,
      })),
      companyName: subadmin?.companyName,
      bonusFlag: subadmin?.bonusFlag,
    });
  } catch (err) {
    res
      .status(500)
      .send({ message: "Internal Server Error", error: err.message });
  }
};

//get tickets
exports.getTicket = async (req, res) => {
  try {
    const { fromDate, toDate, lotteryCategoryName, seller } = req.query;
    const query = { isDelete: false };
    query.date = { $gte: fromDate, $lte: toDate };

    if (seller == "") {
      const sellers = await User.find({ subAdminId: req.userId }, { _id: 1 });
      let sellerIds = [];
      sellers.map((item) => {
        sellerIds.push(item._id);
      });
      query.seller = { $in: sellerIds };
    } else {
      query.seller = mongoose.Types.ObjectId(seller);
    }

    if (lotteryCategoryName != "") {
      query.lotteryCategoryName = lotteryCategoryName;
    }
    const ticketsObj = await Ticket.find(query).sort({
      lotteryCategoryName: 1,
      date: 1,
    });
    res.send({ success: true, data: ticketsObj });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

//delete Tickets
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
      moment(new Date(today), "YYYY-MM-DD").isSame(
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

// // Update
// exports.updateBonusFlag = async (req, res) => {
//   const bonusFlag = req.body.bonusFlag;
//   try {
//     const user = await User.findById(req.userId);
//     if (!user) {
//       res.status(404).send();
//     }

//     user.bonusFlag = bonusFlag;

//     await user.save();
//     res.send(user);
//   } catch (err) {
//     res.status(400).send(err);
//   }
// };

// // Delete
// exports.deleteseller = async (req, res) => {
//   try {
//     const user = await User.findByIdAndDelete(req.params.id);
//     if (!user) {
//       res.status(404).send();
//       return;
//     }
//     res.send(user);
//   } catch (err) {
//     res.status(500).send(err);
//   }
// };
