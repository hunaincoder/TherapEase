var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const moment = require("moment-timezone");
const flash = require("connect-flash");
const ConnectMongo = require("./config/DB");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config();
const {
  scheduleAppointmentStatusUpdate,
} = require("./jobs/updateAppointmentStatus");

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
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);
app.use("/audio", express.static(path.join(__dirname, "assets/audio")));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

ConnectMongo().then(() => {
  console.log("MongoDB connected, starting appointment status cron job");
  scheduleAppointmentStatusUpdate();
});

const sessionOptions = {
  secret: process.env.SESSION_SECRET || "hunain",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,  
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  },
};

const adminSession = session({
  ...sessionOptions,
  name: "admin.sid",
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "admin_sessions",
  }),
});

const therapistSession = session({
  ...sessionOptions,
  name: "therapist.sid",
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "therapist_sessions",
  }),
});

const patientSession = session({
  ...sessionOptions,
  name: "patient.sid",
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "patient_sessions",
  }),
});

app.use((req, res, next) => {
  if (req.path.startsWith("/ws") || req.path.startsWith("/socket.io")) {
    return next();
  }
  if (req.path.startsWith("/therapist")) {
    therapistSession(req, res, next);
  } else if (req.path.startsWith("/client")) {
    patientSession(req, res, next);
  } else {
    adminSession(req, res, next);
  }
});
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.moment = moment;
  next();
});

passport.serializeUser((user, done) => {
  const key =
    user instanceof AdminModel
      ? "admin"
      : user instanceof TherapistModel
      ? "therapist"
      : "patient";
  done(null, { id: user.id, type: key });
});

passport.deserializeUser(async (obj, done) => {
  try {
    let user;
    switch (obj.type) {
      case "admin":
        user = await AdminModel.findById(obj.id);
        break;
      case "therapist":
        user = await TherapistModel.findById(obj.id);
        break;
      case "patient":
        user = await PatientModel.findById(obj.id);
        break;
      default:
        return done(null, false);
    }

    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (err) {
    console.error("Error in deserializeUser:", err);
    done(err, null);
  }
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
  res.locals.successMessage = req.flash("successMessage");
  res.locals.errorMessage = req.flash("errorMessage");
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
