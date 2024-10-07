const mongoose = require("mongoose");
const db = require("../../models");
const LimitBut = db.limits;
const SpecificLimits = db.specificLimits;

// Create
exports.addLimitBut = async (req, res) => {
  const { lotteryCategoryName, limits, seller, general } = req.body;
  try {
    let newLimit = null;
    if (general) {
      if (seller != "") {
        newLimit = new LimitBut({
          subAdmin: req.userId,
          lotteryCategoryName,
          limits,
          seller,
        });
      } else {
        newLimit = new LimitBut({
          subAdmin: req.userId,
          lotteryCategoryName,
          limits,
        });
      }
    } else {
      if (seller != "") {
        newLimit = new SpecificLimits({
          subAdmin: req.userId,
          lotteryCategoryName,
          limits,
          seller,
        });
      } else {
        newLimit = new SpecificLimits({
          subAdmin: req.userId,
          lotteryCategoryName,
          limits,
        });
      }
    }

    await newLimit.save();

    if(general) {
      newLimit = await LimitBut.findById(newLimit._id).populate("seller");
    } else {
      newLimit = await SpecificLimits.findById(newLimit._id).populate("seller");
    }

    res.send(newLimit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// Read
exports.getLimitBut = async (req, res) => {
  try {
    const { general } = req.query;
    let limits = null;
    if (general == "true") {
      limits = await LimitBut.find({
        subAdmin: req.userId,
      }).populate("seller");
    } else {
      limits = await SpecificLimits.find({
        subAdmin: req.userId,
      }).populate("seller");
    }
    res.json(limits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// Update
exports.updateLimitBut = async (req, res) => {
  const { id } = req.params;
  const { lotteryCategoryName, limits, seller, general } = req.body;

  try {
    let limit = null;
    if(general) {
      limit = await LimitBut.findById(id);

    } else {
      limit = await SpecificLimits.findById(id);
    }

    if (!limit) {
      return res.status(404).json({ message: "Limit not found" });
    }

    limit.lotteryCategoryName = lotteryCategoryName;
    limit.limits = limits;

    if (seller == "") {
      limit.seller = null;
    } else {
      limit.seller = seller;
    }

    limit = await limit.save();

    if(general) {
      limit = await LimitBut.findById(id).populate("seller");
    } else {
      limit = await SpecificLimits.findById(id).populate("seller");
    }

    res.json(limit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// DELETE a block number by ID
exports.deleteLimitBut = async (req, res) => {
  const { id } = req.params;
  const { general } = req.body;
  try {
    let limit = null;

    if(general) {
      limit = await LimitBut.findById(id);

    } else {
      limit = await SpecificLimits.findById(id);
    }

    if (!limit) {
      return res.status(404).json({ message: "Limit not found" });
    }

    await limit.remove();

    res.json({ message: "Limit removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};
