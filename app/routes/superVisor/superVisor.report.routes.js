const { authJwt } = require("../../middlewares");
const controller = require("../../controllers/superVisor/superVisor.report.controller");

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept");
    next();
  });

  // ticket sale reports
  app.get(
    "/api/superVisor/getsalereports",
    [authJwt.verifyToken],
    controller.getSaleReports
  );

  app.get(
    "/api/superVisor/getselldetails",
    [authJwt.verifyToken],
    controller.getSellDetails
  );
  app.get(
    "/api/superVisor/getselldetailsbygamecategory",
    [authJwt.verifyToken],
    controller.getSellDetailsByGameCategory
  );
  app.get(
    "/api/superVisor/getselldetailsallloterycategory",
    [authJwt.verifyToken],
    controller.getSellDetailsByAllLoteryCategory
  );
  app.get(
    "/api/superVisor/getsellgamenumberinfo",
    [authJwt.verifyToken],
    controller.getSellGameNumberInfo
  );
};
