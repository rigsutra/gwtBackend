const { authJwt, verifySignUp } = require("../../middlewares");
const controller = require("../../controllers/superVisor/superVisor.soldTickets.controller");

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept");
    next();
  });

  // Add Sub Admin

  // Read Sub Admin
  app.get(
    "/api/superVisor/getseller",
    [authJwt.verifyToken, authJwt.isSuperVisor],
    controller.getseller
  );

  // Read all
  app.get(
    "/api/superVisor/gettickets",
    [authJwt.verifyToken, authJwt.isSuperVisor],
    controller.getTicket
  );

  // Delete tickets
  app.delete(
    "/api/superVisor/deleteticket/:id",
    [authJwt.verifyToken, authJwt.isSuperVisor],
    controller.deleteTicket
  );
};
