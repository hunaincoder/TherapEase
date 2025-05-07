const express = require("express");
const router = express.Router();
const passport = require("passport");
const authRoutes = require("./TherapistOauth");
const LocalStrategy = require("passport-local").Strategy;
const TherapistModel = require("../models/therapist");
const multer = require("multer");
const path = require("path");
const AppointmentModel = require("../models/appointments");
const TransactionModel = require("../models/transaction");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const flash = require("connect-flash");

router.use(flash());
router.use(authRoutes);

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

passport.use(
  "therapist-local",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const therapist = await TherapistModel.findOne({ email });

        if (!therapist) {
          return done(null, false, { message: "Invalid email or password" });
        }

        therapist.authenticate(password, (err, user, passwordError) => {
          if (err || passwordError) {
            return done(null, false, { message: "Invalid email or password" });
          }

          if (therapist.status === "Rejected") {
            return done(null, false, { message: "Account has been rejected" });
          }

          if (therapist.status !== "Approved") {
            return done(null, false, { message: "Account pending approval" });
          }

          return done(null, therapist);
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

router.get("/login", function (req, res) {
  res.render("therapist/login", { messages: req.flash() });
});

router.post("/login", (req, res, next) => {
  passport.authenticate("therapist-local", (err, user, info) => {
    if (err) {
      req.flash("error", "Authentication error");
      return res.redirect("/therapist/login");
    }
    if (!user) {
      req.flash("error", info.message);
      return res.redirect("/therapist/login");
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        req.flash("error", "Login failed");
        return res.redirect("/therapist/login");
      }
      req.flash("success", "Successfully logged in");
      res.redirect("/therapist/dashboard");
    });
  })(req, res, next);
});

router.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const therapistId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const Appointments = await AppointmentModel.countDocuments({
      therapistId,
      date: { $gte: today },
      status: "Scheduled",
    });

    const PatientIds = await AppointmentModel.distinct("patientId", {
      therapistId,
    });
    const totalPatients = PatientIds.length;

    const totalAppointments = await AppointmentModel.countDocuments({
      therapistId,
    });

    const transactions = await TransactionModel.find({
      therapist: therapistId,
    });
    const totalRevenue = transactions.reduce(
      (acc, txn) => acc + txn.totalAmount,
      0
    );

    const recentAppointments = await AppointmentModel.find({ therapistId })
      .sort({ date: -1 })
      .limit(5)
      .populate("patientId");

    const recentTransactions = await TransactionModel.find({
      therapist: therapistId,
    })
      .sort({ date: -1 })
      .limit(5)
      .populate("patient");

    const revenueData = await TransactionModel.aggregate([
      {
        $match: {
          therapist: therapistId,
          date: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const appointmentData = await AppointmentModel.aggregate([
      {
        $match: {
          therapistId,
          date: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: "%Y-%m", date: "$date" } },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    res.render("therapist/dashboard", {
      therapist: req.user,
      Appointments,
      totalPatients,
      totalAppointments,
      totalRevenue,
      recentAppointments,
      recentTransactions,
      appointmentData,
      revenueData,
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Internal Server Error");
    res.redirect("/therapist/login");
  }
});

router.get("/appointment-confirmation", isLoggedIn, async (req, res) => {
  try {
    const appointments = await AppointmentModel.find({
      therapistId: req.user._id,
      status: "Scheduled",
    }).populate("patientId");

    res.render("therapist/appointment-confirmation", {
      therapist: req.user,
      appointments,
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Error fetching appointments");
    res.redirect("/therapist/dashboard");
  }
});

router.get("/appointment-list", isLoggedIn, async (req, res) => {
  try {
    const therapistId = req.user._id;
    const filter = req.query.filter || "All";

    let query = { therapistId };
    switch (filter) {
      case "Scheduled":
        query.status = "Scheduled";
        break;
      case "Completed":
        query.status = "Completed";
        break;
      case "Cancelled":
        query.status = "Cancelled";
        break;
      default:
        break;
    }

    const appointments = await AppointmentModel.find(query)
      .populate("patientId")
      .sort({ date: -1 });

    const counts = {
      all: await AppointmentModel.countDocuments({ therapistId }),
      scheduled: await AppointmentModel.countDocuments({
        therapistId,
        status: "Scheduled",
      }),
      completed: await AppointmentModel.countDocuments({
        therapistId,
        status: "Completed",
      }),
      cancelled: await AppointmentModel.countDocuments({
        therapistId,
        status: "Cancelled",
      }),
    };

    const now = moment().tz("Asia/Karachi");

    const formattedAppointments = appointments.map((appt) => {
      const appointmentDateTime = moment.tz(
        `${moment(appt.date).format("YYYY-MM-DD")} ${appt.time}`,
        "YYYY-MM-DD HH:mm",
        "Asia/Karachi"
      );

      const windowStart = moment(appointmentDateTime).subtract(5, "minutes");
      const windowEnd = moment(appointmentDateTime).add(30, "minutes");

      return {
        ...appt._doc,
        formattedDate: moment(appt.date).format("DD MMM YYYY"),
        timeRange: `${moment(appt.time, "HH:mm").format("h:mm A")} - ${moment(
          appt.time,
          "HH:mm"
        )
          .add(30, "minutes")
          .format("h:mm A")}`,
        canJoinCall:
          now.isBetween(windowStart, windowEnd, null, "[]") &&
          appt.status === "Scheduled" &&
          appt.sessionType === "video",
        windowStart,
        windowEnd,
      };
    });

    res.render("therapist/appointment-list", {
      therapist: req.user,
      appointments: formattedAppointments,
      counts,
      currentFilter: filter,
      moment: moment,
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Internal Server Error");
    res.redirect("/therapist/dashboard");
  }
});

router.get("/video-call/:id", isLoggedIn, async (req, res) => {
  try {
    const appointmentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      console.error(`Invalid appointment ID format: ${appointmentId}`);
      req.flash("error", "Invalid appointment ID format");
      return res.redirect("/therapist/appointment-list");
    }

    const appointment = await AppointmentModel.findById(appointmentId)
      .populate("patientId")
      .populate("therapistId");

    if (!appointment) {
      console.error(`Appointment not found for ID: ${appointmentId}`);
      req.flash("error", "Appointment not found");
      return res.redirect("/therapist/appointment-list");
    }

    if (appointment.therapistId._id.toString() !== req.user._id.toString()) {
      console.error(`Unauthorized access attempt by user: ${req.user._id}`);
      req.flash("error", "Unauthorized access");
      return res.redirect("/therapist/appointment-list");
    }

    if (appointment.status !== "Scheduled") {
      req.flash("error", "This appointment is not active");
      return res.redirect("/therapist/appointment-list");
    }

    if (appointment.sessionType !== "video") {
      req.flash("error", "This appointment is not a video call");
      return res.redirect("/therapist/appointment-list");
    }

    if (!moment().isSame(moment(appointment.date), "day")) {
      req.flash("error", "This appointment is not scheduled for today");
      return res.redirect("/therapist/appointment-list");
    }

    const appointmentDateTime = moment.tz(
      `${moment(appointment.date).format("YYYY-MM-DD")} ${appointment.time}`,
      "YYYY-MM-DD HH:mm",
      "Asia/Karachi"
    );

    const windowStart = moment(appointmentDateTime).subtract(5, "minutes");
    const windowEnd = moment(appointmentDateTime).add(30, "minutes");
    const now = moment().tz("Asia/Karachi");

    if (now.isBefore(windowStart)) {
      req.flash("error", "Call is not available yet");
      return res.redirect("/therapist/appointment-list");
    }

    if (now.isAfter(windowEnd)) {
      req.flash("error", "Call has ended");
      return res.redirect("/therapist/appointment-list");
    }

    res.render("shared/video-call", {
      user: req.user,
      appointment,
      sessionPartnerName: `${appointment.patientId.firstname} ${appointment.patientId.lastname}`,
      displayName: `${req.user.firstName} ${req.user.lastName || ""}`,
      isTherapist: true,
      appointmentDateFormatted: moment(appointment.date).format("MMM Do YYYY"),
      appointmentEndTimeFormatted: moment(appointment.time, "HH:mm")
        .add(30, "minutes")
        .format("h:mm A"),
      stunServers: process.env.STUN_SERVERS,
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error accessing video call:", {
      appointmentId: req.params.id,
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
    });
    req.flash("error", "Internal Server Error");
    res.redirect("/therapist/appointment-list");
  }
});

router.post("/complete-appointment/:id", isLoggedIn, async (req, res) => {
  try {
    const appointment = await AppointmentModel.findById(req.params.id).populate(
      "therapistId"
    );

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    if (appointment.therapistId._id.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });
    }

    if (appointment.status !== "Scheduled") {
      return res
        .status(400)
        .json({ success: false, message: "Appointment is not scheduled" });
    }

    appointment.status = "Completed";
    await appointment.save();

    const transaction = await TransactionModel.findOne({
      appointment: appointment._id,
    });
    if (transaction) {
      transaction.status = "completed";
      await transaction.save();
    }

    res.json({ success: true, message: "Appointment marked as completed" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.post("/cancel-appointment/:id", isLoggedIn, async (req, res) => {
  try {
    const appointment = await AppointmentModel.findById(req.params.id)
      .populate("patientId")
      .populate("therapistId");

    if (!appointment) {
      req.flash("error", "Appointment not found");
      return res.redirect("/therapist/appointment-confirmation");
    }

    appointment.status = "Cancelled";
    await appointment.save();

    const transaction = await TransactionModel.findOne({
      appointment: appointment._id,
    });

    if (transaction) {
      transaction.status = "cancelled";
      await transaction.save();
    }

    req.flash("success", "Appointment cancelled successfully");
    res.redirect("/therapist/appointment-confirmation");
  } catch (error) {
    req.flash("error", "Error processing cancellation");
    res.redirect("/therapist/appointment-confirmation");
  }
});

router.get("/change-pass", isLoggedIn, (req, res) => {
  res.render("therapist/change-pass", {
    therapist: req.user,
    messages: req.flash(),
  });
});

router.get("/invoices", isLoggedIn, async (req, res) => {
  try {
    const therapisId = req.user._id;
    const transactions = await TransactionModel.find({ therapist: therapisId })
      .populate({
        path: "appointment",
        populate: [
          { path: "therapistId", model: "Therapist" },
          { path: "patientId", model: "Patient" },
        ],
      })
      .sort({ date: -1 });

    res.render("therapist/invoices", {
      transactions: transactions.map((t) => ({
        ...t._doc,
        formattedDate: moment(t.date).format("MMM D, YYYY"),
        appointmentDate: moment(t.appointment.date).format("MMM D, YYYY"),
      })),
      therapist: req.user,
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Internal Server Error");
    res.redirect("/therapist/dashboard");
  }
});

router.get("/invoice/:id", isLoggedIn, async (req, res) => {
  try {
    const appointmentId = req.params.id;

    const appointment = await AppointmentModel.findById(appointmentId)
      .populate("therapistId")
      .populate("patientId");
    if (!appointment) {
      req.flash("error", "Appointment not found");
      return res.redirect("/therapist/invoices");
    }

    if (!appointment.patientId) {
      req.flash("error", "Patient details not found");
      return res.redirect("/therapist/invoices");
    }

    const transaction = await TransactionModel.findOne({
      appointment: appointmentId,
    });

    if (!transaction) {
      req.flash("error", "Transaction not found");
      return res.redirect("/therapist/invoices");
    }

    res.render("therapist/invoice", {
      appointment: {
        ...appointment._doc,
        formattedDate: `${getOrdinal(moment(appointment.date).date())} ${moment(
          appointment.date
        ).format("dddd")}`,
        time: `${moment(appointment.time, "HH:mm").format(
          "h:mm A"
        )} to ${moment(appointment.time, "HH:mm")
          .add(30, "minutes")
          .format("h:mm A")}`,
      },
      transaction: {
        ...transaction._doc,
        totalAmount: transaction.amount + transaction.tax,
        status: transaction.status,
      },
      patient: appointment.patientId,
      therapist: appointment.therapistId,
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Internal Server Error");
    res.redirect("/therapist/invoices");
  }
});

router.get("/payout", isLoggedIn, async (req, res) => {
  try {
    const therapistId = req.user._id;
    const therapist = await TherapistModel.findById(therapistId);

    const completedTransactions = await TransactionModel.find({
      therapist: therapistId,
      status: "completed",
    });

    const totalEarned = completedTransactions.reduce(
      (acc, txn) => acc + txn.amount,
      0
    );

    const balanceTransactions = await TransactionModel.find({
      therapist: therapistId,
      status: "completed",
      therapistPayout: "not paid",
    });
    const totalBalance = balanceTransactions.reduce(
      (acc, txn) => acc + txn.amount,
      0
    );

    const requestedTransactions = await TransactionModel.find({
      therapist: therapistId,
      therapistPayout: "requested",
    });
    const totalRequested = requestedTransactions.reduce(
      (acc, txn) => acc + txn.amount,
      0
    );

    const payoutHistory = await TransactionModel.find({
      therapist: therapistId,
      therapistPayout: { $in: ["requested", "paid"] },
    }).sort({ date: -1 });

    res.render("therapist/payout", {
      therapist,
      totalBalance,
      totalEarned,
      totalRequested,
      payoutHistory,
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Internal Server Error");
    res.redirect("/therapist/dashboard");
  }
});

router.post("/payout", isLoggedIn, async (req, res) => {
  try {
    const therapistId = req.user._id;

    const unpaidTransactions = await TransactionModel.find({
      therapist: therapistId,
      status: "completed",
      therapistPayout: "not paid",
    });

    if (unpaidTransactions.length === 0) {
      req.flash("error", "No unpaid transactions available for payout");
      return res.redirect("/therapist/payout");
    }

    await TransactionModel.updateMany(
      {
        therapist: therapistId,
        therapistPayout: "not paid",
        status: "completed",
      },
      { therapistPayout: "requested" }
    );
    req.flash("success", "Payout request submitted successfully");
    res.redirect("/therapist/payout");
  } catch (error) {
    req.flash("error", "Error processing payout request");
    res.redirect("/therapist/payout");
  }
});

router.post("/update-bank-details", isLoggedIn, async (req, res) => {
  try {
    const therapistId = req.user._id;

    const { bankName, branchName, accountNumber, accountName } = req.body;

    const therapist = await TherapistModel.findById(therapistId);

    if (!therapist) {
      req.flash("error", "Therapist not found");
      return res.redirect("/therapist/payout");
    }

    therapist.bankDetails = {
      bankName,
      branchName,
      accountNumber,
      accountName,
    };

    await therapist.save();
    req.flash("success", "Bank details updated successfully");
    res.redirect("/therapist/payout");
  } catch (error) {
    req.flash("error", "Error saving bank details");
    res.redirect("/therapist/payout");
  }
});

router.get("/profile", isLoggedIn, async (req, res) => {
  try {
    const weekdays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    const timeSlots = [];
    const hours = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24,
    ];

    hours.forEach((hour) => {
      const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
      const displayHour = hour % 12 || 12;
      const ampm = hour < 12 ? "AM" : "PM";

      timeSlots.push({
        value: `${hourStr}:00`,
        display: `${displayHour}:00 ${ampm}`,
      });

      timeSlots.push({
        value: `${hourStr}:30`,
        display: `${displayHour}:30 ${ampm}`,
      });
    });

    const therapist = await TherapistModel.findById(req.user._id).lean();

    if (!therapist) {
      req.flash("error", "Therapist not found");
      return res.redirect("/therapist/dashboard");
    }

    const bookedSlots = {};
    if (therapist.availability && therapist.availability.length > 0) {
      therapist.availability.forEach((slot) => {
        if (slot.day && slot.startTime && slot.endTime) {
          if (!bookedSlots[slot.day]) {
            bookedSlots[slot.day] = [];
          }
          bookedSlots[slot.day].push({
            start: slot.startTime,
            end: slot.endTime,
          });
        }
      });
    }

    res.render("therapist/profile", {
      therapist: therapist,
      weekdays: weekdays,
      timeSlots: timeSlots,
      bookedSlots: JSON.stringify(bookedSlots),
      messages: req.flash(),
    });
  } catch (error) {
    req.flash("error", "Error loading profile page");
    res.redirect("/therapist/dashboard");
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "assets/img/profiles");
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `therapist-${req.user.username}${path.extname(file.originalname)}`
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPEG, PNG and GIF are allowed."),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.post(
  "/profile",
  isLoggedIn,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const therapistId = req.user._id;
      const therapist = await TherapistModel.findById(therapistId);

      if (!therapist) {
        req.flash("error", "Therapist not found");
        return res.redirect("/therapist/profile");
      }

      therapist.username = req.body.username || therapist.username;
      therapist.email = req.body.email || therapist.email;
      therapist.firstName = req.body.firstName || therapist.firstName;
      therapist.lastName = req.body.lastName || therapist.lastName;
      therapist.phone = req.body.phone || therapist.phone;
      therapist.gender = req.body.gender || therapist.gender;
      therapist.dateOfBirth = req.body.dateOfBirth || therapist.dateOfBirth;
      therapist.city = req.body.city || therapist.city;
      therapist.state = req.body.state || therapist.state;
      therapist.bio = req.body.bio || therapist.bio;
      therapist.clinicName = req.body.clinicName || therapist.clinicName;
      therapist.clinicAddress =
        req.body.clinicAddress || therapist.clinicAddress;

      if (req.file) {
        therapist.profilePicture = `/img/profiles/${req.file.filename}`;
      }

      therapist.services = req.body.services
        ? req.body.services.split(",").map((s) => s.trim())
        : therapist.services;
      therapist.specialties = req.body.specialties
        ? req.body.specialties.split(",").map((s) => s.trim())
        : therapist.specialties;

      if (req.body.degree || req.body.college || req.body.yearOfCompletion) {
        therapist.education = [
          {
            degree: req.body.degree,
            college: req.body.college,
            yearOfCompletion: req.body.yearOfCompletion,
          },
        ];
      }

      if (
        req.body.clinicExperience ||
        req.body.from ||
        req.body.to ||
        req.body.designation
      ) {
        therapist.experience = [
          {
            clinicExperience: req.body.clinicExperience,
            from: req.body.from ? new Date(req.body.from) : undefined,
            to:
              req.body.to && req.body.to !== "Present"
                ? new Date(req.body.to)
                : null,
            designation: req.body.designation,
          },
        ];
      }

      if (req.body.awards || req.body.awardYear) {
        therapist.awards = [
          {
            name: req.body.awards,
            year: req.body.awardYear,
          },
        ];
      }

      therapist.fee = req.body.fee || therapist.fee;

      const cleanBody = {};
      for (let key in req.body) {
        cleanBody[key.trim()] = req.body[key];
      }

      const days = Array.isArray(cleanBody.availableDays)
        ? cleanBody.availableDays
        : [cleanBody.availableDays];
      const startTimes = Array.isArray(cleanBody.startTime)
        ? cleanBody.startTime
        : [cleanBody.startTime];
      const endTimes = Array.isArray(cleanBody.endTime)
        ? cleanBody.endTime
        : [cleanBody.endTime];

      therapist.availability = [];
      for (let i = 0; i < days.length; i++) {
        if (days[i] && startTimes[i] && endTimes[i]) {
          therapist.availability.push({
            day: days[i].trim(),
            startTime: startTimes[i].trim(),
            endTime: endTimes[i].trim(),
          });
        }
      }

      await therapist.save();
      req.flash("success", "Profile updated successfully");
      res.redirect("/therapist/profile");
    } catch (error) {
      req.flash("error", "Error updating therapist profile");
      res.redirect("/therapist/profile");
    }
  }
);

router.get("/register", function (req, res) {
  res.render("therapist/register", { messages: req.flash() });
});

router.post("/register", async function (req, res) {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      req.flash("error", "All fields are required");
      return res.redirect("/therapist/register");
    }

    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(email)) {
      req.flash("error", "Invalid email format");
      return res.redirect("/therapist/register");
    }

    const existingTherapist = await TherapistModel.findOne({ email: email });
    if (existingTherapist) {
      req.flash("error", "Email already in use");
      return res.redirect("/therapist/register");
    }

    const therapist = new TherapistModel({
      username,
      email,
      status: "Pending",
    });

    TherapistModel.register(
      therapist,
      password,
      async function (err, newTherapist) {
        if (err) {
          req.flash("error", "Error registering therapist");
          return res.redirect("/therapist/register");
        }

        req.login(newTherapist, function (err) {
          if (err) {
            req.flash("error", "Error logging in therapist");
            return res.redirect("/therapist/register");
          }
          req.flash("success", "Successfully registered");
          return res.redirect("/therapist/profile-setup");
        });
      }
    );
  } catch (err) {
    req.flash("error", "Error occurred during signup");
    res.redirect("/therapist/register");
  }
});

router.get("/profile-setup", isLoggedIn, async function (req, res) {
  try {
    const therapist = await TherapistModel.findById(req.user._id).lean();
    if (!therapist) {
      req.flash("error", "Therapist not found");
      return res.redirect("/therapist/login");
    }
    res.render("therapist/profile-setup", { therapist, messages: req.flash() });
  } catch (error) {
    req.flash("error", "Error loading profile setup page");
    res.redirect("/therapist/login");
  }
});

router.post(
  "/profile-setup",
  isLoggedIn,
  upload.single("profilePicture"),
  async function (req, res) {
    try {
      if (!req.isAuthenticated()) {
        req.flash("error", "Please log in to access this page");
        return res.redirect("/therapist/login");
      }

      if (!req.user.status || req.user.status !== "Pending") {
        req.flash("error", "Profile setup not allowed");
        return res.redirect("/therapist/dashboard");
      }

      const therapistId = req.user._id;
      const therapist = await TherapistModel.findById(therapistId);

      if (!therapist) {
        req.flash("error", "Therapist not found");
        return res.redirect("/therapist/login");
      }

      therapist.firstName = req.body.firstName || therapist.firstName || "";
      therapist.lastName = req.body.lastName || therapist.lastName || "";
      therapist.phone = req.body.phone || therapist.phone || "";
      therapist.gender = req.body.gender || therapist.gender || "";
      therapist.dateOfBirth =
        req.body.dateOfBirth || therapist.dateOfBirth || null;
      therapist.city = req.body.city || therapist.city || "";
      therapist.state = req.body.state || therapist.state || "";
      therapist.bio = req.body.bio || therapist.bio || "";
      therapist.clinicName = req.body.clinicName || therapist.clinicName || "";
      therapist.clinicAddress =
        req.body.clinicAddress || therapist.clinicAddress || "";

      therapist.services = req.body.services
        ? req.body.services
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s)
        : therapist.services || [];
      therapist.specialties = req.body.specialties
        ? req.body.specialties
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s)
        : therapist.specialties || [];

      if (req.body.degree || req.body.college || req.body.yearOfCompletion) {
        therapist.education = [
          {
            degree: req.body.degree || "",
            college: req.body.college || "",
            yearOfCompletion: req.body.yearOfCompletion || "",
          },
        ];
      } else {
        therapist.education = therapist.education || [];
      }

      if (
        req.body.clinicExperience ||
        req.body.from ||
        req.body.to ||
        req.body.designation
      ) {
        therapist.experience = [
          {
            clinicExperience: req.body.clinicExperience || "",
            from: req.body.from ? new Date(req.body.from) : undefined,
            to:
              req.body.to && req.body.to !== "Present"
                ? new Date(req.body.to)
                : null,
            designation: req.body.designation || "",
          },
        ];
      } else {
        therapist.experience = therapist.experience || [];
      }

      if (req.body.awards || req.body.awardYear) {
        therapist.awards = [
          {
            name: req.body.awards || "",
            year: req.body.awardYear || "",
          },
        ];
      } else {
        therapist.awards = therapist.awards || [];
      }

      const days = Array.isArray(req.body.availableDays)
        ? req.body.availableDays
        : req.body.availableDays
        ? [req.body.availableDays]
        : [];
      const startTimes = Array.isArray(req.body.startTime)
        ? req.body.startTime
        : req.body.startTime
        ? [req.body.startTime]
        : [];
      const endTimes = Array.isArray(req.body.endTime)
        ? req.body.endTime
        : req.body.endTime
        ? [req.body.endTime]
        : [];

      therapist.availability = [];
      for (let i = 0; i < days.length; i++) {
        if (days[i] && startTimes[i] && endTimes[i]) {
          therapist.availability.push({
            day: days[i].trim(),
            startTime: startTimes[i].trim(),
            endTime: endTimes[i].trim(),
          });
        }
      }

      if (req.file) {
        therapist.profilePicture = `/img/profiles/${req.file.filename}`;
      }

      await therapist.save();

      req.logout(function (err) {
        if (err) {
          req.flash("error", "Error during logout");
          return res.redirect("/therapist/profile-setup");
        }

        req.flash("success", "Profile setup completed successfully");
        res.render("therapist/registration-complete", {
          messages: req.flash(),
        });
      });
    } catch (error) {
      req.flash("error", "Error updating profile");
      res.redirect("/therapist/profile-setup");
    }
  }
);

router.get("/registration-complete", (req, res) => {
  res.render("therapist/registration-complete", { messages: req.flash() });
});

router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      req.flash("error", "Error logging out");
      return next(err);
    }
    res.clearCookie("therapist.sid");
    req.flash("success", "Successfully logged out");
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return next(err);
      }
      res.redirect("/therapist/login");
    });
  });
});

router.post("/change-pass", isLoggedIn, async function (req, res) {
  try {
    const therapistId = req.user._id;
    const { oldpass, newpass, confirmpass } = req.body;
    const therapist = await TherapistModel.findById(therapistId);

    if (!oldpass || !newpass || !confirmpass) {
      req.flash("error", "Please fill all fields");
      return res.redirect("/therapist/change-pass");
    }
    if (newpass !== confirmpass) {
      req.flash("error", "New Password and Confirm Password do not match");
      return res.redirect("/therapist/change-pass");
    }
    if (!therapist) {
      req.flash("error", "Therapist not found");
      return res.redirect("/therapist/change-pass");
    }

    await new Promise((resolve, reject) => {
      therapist.authenticate(oldpass, (err, user, passwordError) => {
        if (err || passwordError) {
          reject(new Error("Old Password is incorrect"));
        }
        resolve(user);
      });
    });

    await therapist.setPassword(newpass);
    await therapist.save();
    req.flash("success", "Password changed successfully");
    return res.redirect("/therapist/change-pass");
  } catch (err) {
    req.flash("error", err.message || "Error changing password");
    return res.redirect("/therapist/change-pass");
  }
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated() && req.user.status) {
    return next();
  }
  req.flash("error", "Please log in to access this page");
  res.redirect("/therapist/login");
}

module.exports = router;
