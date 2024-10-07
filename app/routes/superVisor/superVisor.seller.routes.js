const { authJwt, verifySignUp } = require("../../middlewares");
const controller = require("../../controllers/superVisor/superVisor.seller.controller");

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept");
    next();
  });

  //   // Add Sub Admin
  //   app.post(
  //     "/api/subadmin/addseller",
  //     [authJwt.verifyToken, authJwt.isSubAdmin],
  //     controller.addseller
  //   );

  // Read Sub Admin
  app.get(
    "/api/superVisor/getseller",
    [authJwt.verifyToken, authJwt.isSuperVisor],
    controller.getseller
  );

  // Update Sub Admin
  app.patch(
    "/api/superVisor/updateseller/:id",
    [authJwt.verifyToken, authJwt.isSuperVisor],
    controller.updateseller
  );

  //   // Update Sub Admin
  //   app.patch(
  //     "/api/subadmin/updateBonusFlag",
  //     [authJwt.verifyToken, authJwt.isSubAdmin],
  //     controller.updateBonusFlag
  //   );
};
