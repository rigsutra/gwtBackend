const db = require("../../models");
const User = db.user;

var bcrypt = require("bcryptjs");

// Create
exports.addseller = async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      ...req.body,
      password: hashedPassword,
      role: "seller",
      subAdminId: req.userId,
    });
    await user.save();
    res.status(201).send(user);
  } catch (err) {
    res.status(400).send(err);
  }
};

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

// Update
exports.updateseller = async (req, res) => {
  const updates = Object.keys(req.body);
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).send();
    }
    updates.forEach((update) => {
      if (`${req.body[update]}` != "") {
        // only update if the field exists in the req.body object
        user[update] = req.body[update];
      }
    });
    if (req.body.password) {
      user.password = await bcrypt.hash(req.body.password, 10);
    }
    await user.save();
    res.send(user);
  } catch (err) {
    res.status(400).send(err);
  }
};

// Update
exports.updateBonusFlag = async (req, res) => {
  const bonusFlag = req.body.bonusFlag;
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).send();
    }

    user.bonusFlag = bonusFlag;

    await user.save();
    res.send(user);
  } catch (err) {
    res.status(400).send(err);
  }
};

// Delete
exports.deleteseller = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).send();
      return;
    }
    res.send(user);
  } catch (err) {
    res.status(500).send(err);
  }
};
