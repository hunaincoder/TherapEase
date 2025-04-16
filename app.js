var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const moment = require("moment-timezone");
const flash = require("connect-flash");
require("dotenv").config();

var indexRouter = require("./routes/index");
var TherapistRoutes = require("./routes/therapistroutes");
var patientRoutes = require("./routes/patientroutes");
var AdminModel = require("./models/admin");
var TherapistModel = require("./models/therapist");
var PatientModel = require("./models/patient");
const passport = require("passport");

var app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "hunain",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "strict",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.moment = moment;
  next();
});

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user =
    (await AdminModel.findById(id)) ||
    (await TherapistModel.findById(id)) ||
    (await PatientModel.findById(id));
  done(null, user);
});

app.use((req, res, next) => {
  if (req.session && req.session.passport && req.session.passport.user) {
    console.log("Session is active:", req.session.passport.user);
  }
  next();
});

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "assets")));

app.use(flash());
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

app.use("/", indexRouter);
app.use("/therapist", TherapistRoutes);
app.use("/client", patientRoutes);

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
