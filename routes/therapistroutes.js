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
  res.render("therapist/login");
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const therapist = await TherapistModel.findOne({ email });

    if (!therapist) {
      return res.status(400).send("Invalid email or password");
    }

    therapist.authenticate(password, (authErr, user, passwordErr) => {
      if (authErr || passwordErr) {
        return res.status(400).send("Invalid email or password");
      }

      if (therapist.status === "Rejected") {
        return res.status(403).send("Your account has been rejected");
      }

      if (therapist.status !== "Approved") {
        return res.status(403).send("Account pending approval");
      }

      req.login(therapist, (loginErr) => {
        if (loginErr) {
          return res.status(500).send("Login failed");
        }

        res.redirect("/therapist/dashboard");
      });
    });
  } catch (err) {
    res.status(500).send("Server error during login");
  }
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
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Server error");
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
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching appointments");
  }
});

router.post("/cancel-appointment/:id", isLoggedIn, async (req, res) => {  
  try {
    const appointment = await AppointmentModel.findById(req.params.id)
      .populate("patientId")
      .populate("therapistId");

    if (!appointment) {
      return res.status(404).send("appointment not found");
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

    res.redirect("/therapist/appointment-confirmation");
  } catch (error) {
    console.error("Cancellation error:", error);
    res.status(500).send("Error processing cancellation");
  }
});

router.get("/change-pass", isLoggedIn, (req, res) => {
  res.render("therapist/change-pass", { therapist: req.user });
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
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/invoice/:id", isLoggedIn, async (req, res) => {
  try {
    const appointmentId = req.params.id;

    const appointment = await AppointmentModel.findById(appointmentId)
      .populate("therapistId")
      .populate("patientId");
    if (!appointment) {
      return res.status(400).send("appointment not found");
    }

    if (!appointment.patientId) {
      return res.status(400).send("Patient details not found");
    }

    console.log("Appointment:", appointment);

    const transaction = await TransactionModel.findOne({
      appointment: appointmentId,
    });

    if (!transaction) {
      return res.status(400).send("appointment not found");
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
    });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    res.status(500).send("Internal Server Error");
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
    });
  } catch (error) {
    console.error("Error fetching payout page:", error);
    res.status(500).send("Server error");
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
      return res
        .status(400)
        .send("No unpaid transactions available for payout");
    }

    await TransactionModel.updateMany(
      {
        therapist: therapistId,
        therapistPayout: "not paid",
        status: "completed",
      },
      { therapistPayout: "requested" }
    );
    res.redirect("/therapist/payout");
  } catch (error) {
    console.error("Error requesting payout:", error);
    res.status(500).send("Error processing payout request");
  }
});

router.post("/update-bank-details", isLoggedIn, async (req, res) => {
  try {
    const therapistId = req.user._id;

    const { bankName, branchName, accountNumber, accountName } = req.body;

    const therapist = await TherapistModel.findById(therapistId);

    if (!therapist) {
      return res.status(404).send("Therapist not found");
    }

    therapist.bankDetails = {
      bankName,
      branchName,
      accountNumber,
      accountName,
    };

    await therapist.save();
    res.redirect("/therapist/payout");
  } catch (error) {
    console.error("Error saving bank details:", error);
    res.status(500).send("Error saving bank details");
  }
});

router.get("/profile", isLoggedIn, async (req, res) => {
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
  for (let hour = 8; hour <= 20; hour++) {
    const hourValue = hour < 10 ? `0${hour}:00` : `${hour}:00`;
    const hourDisplay =
      hour < 12
        ? `${hour}:00 AM`
        : hour === 12
        ? `12:00 PM`
        : `${hour - 12}:00 PM`;

    timeSlots.push({ value: hourValue, display: hourDisplay });

    const halfHourValue = hour < 10 ? `0${hour}:30` : `${hour}:30`;
    const halfHourDisplay =
      hour < 12
        ? `${hour}:30 AM`
        : hour === 12
        ? `12:30 PM`
        : `${hour - 12}:30 PM`;

    timeSlots.push({ value: halfHourValue, display: halfHourDisplay });
  }

  const therapist = await TherapistModel.findById(req.user._id).lean();

  const bookedSlots = {};
  if (therapist.availability && therapist.availability.length > 0) {
    therapist.availability.forEach((slot) => {
      if (slot.day && slot.startTime && slot.endTime) {
        if (!bookedSlots[slot.day]) {
          bookedSlots[slot.day] = [];
        }

        let currentSlot = slot.startTime;
        while (currentSlot !== slot.endTime) {
          bookedSlots[slot.day].push(currentSlot);

          const [hours, minutes] = currentSlot.split(":").map(Number);
          let newHours = hours;
          let newMinutes = minutes + 30;

          if (newMinutes >= 60) {
            newHours += 1;
            newMinutes = 0;
          }

          currentSlot = `${newHours < 10 ? "0" + newHours : newHours}:${
            newMinutes < 10 ? "0" + newMinutes : newMinutes
          }`;
        }
      }
    });
  }

  res.render("therapist/profile", {
    therapist: therapist,
    weekdays: weekdays,
    timeSlots: timeSlots,
    bookedSlots: JSON.stringify(bookedSlots),
  });
});

// multer lgic

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
        return res.status(404).send("Therapist not found");
      }

      console.log("Incoming form data:", req.body);

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
            to: req.body.to ? new Date(req.body.to) : undefined,
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

      console.log(
        "Received availability data:",
        req.body.availableDays,
        req.body.startTime,
        req.body.endTime
      );

      const cleanBody = {};
      for (let key in req.body) {
        cleanBody[key.trim()] = req.body[key];
      }

      console.log("Cleaned form data:", cleanBody);

      const days = Array.isArray(cleanBody.availableDays)
        ? cleanBody.availableDays
        : [cleanBody.availableDays];
      const startTimes = Array.isArray(cleanBody.startTime)
        ? cleanBody.startTime
        : [cleanBody.startTime];
      const endTimes = Array.isArray(cleanBody.endTime)
        ? cleanBody.endTime
        : [cleanBody.endTime];

      console.log("Received availability data:", days, startTimes, endTimes);

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

      console.log("Availability to save:", therapist.availability);
      console.log(
        "Received availability data:",
        req.body["availableDays[]"],
        req.body["startTime[]"],
        req.body["endTime[]"]
      );

      await therapist.save();
      console.log("Successfully saved therapist data:", therapist);
      console.log("Saved availability:", therapist.availability);

      res.redirect("/therapist/profile");
    } catch (error) {
      console.error("Profile update error:", error);
      res
        .status(500)
        .send(`Error updating therapist profile: ${error.message}`);
    }
  }
);

router.get("/register", function (req, res) {
  res.render("therapist/register");
});

router.post("/register", async function (req, res) {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).send("All fields are required");
    }

    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(email)) {
      return res.status(400).send("Invalid email format");
    }

    const existingTherapist = await TherapistModel.findOne({ email: email });
    if (existingTherapist) {
      return res.status(400).send("Email already in use");
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
          console.error(err);
          return res.status(500).send("Error registering therapist");
        }

        req.login(newTherapist, function (err) {
          if (err) {
            console.error(err);
            return res.status(500).send("Error logging in therapist");
          }
          console.log("Therapist logged in successfully:", req.user);
          return res.redirect("/therapist/profile-setup");
        });
      }
    );
  } catch (err) {
    console.log(err);
    res.status(400).send("Error occurred during signup");
  }
});

router.get("/profile-setup", isLoggedIn, async function (req, res) {
  if (!req.isAuthenticated()) {
    return res.redirect("/therapist/login");
  }

  if (!req.user.status || req.user.status !== "Pending") {
    return res.redirect("/therapist/dashboard");
  }

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
  for (let hour = 8; hour <= 20; hour++) {
    const hourValue = hour < 10 ? `0${hour}:00` : `${hour}:00`;
    const hourDisplay =
      hour < 12
        ? `${hour}:00 AM`
        : hour === 12
        ? `12:00 PM`
        : `${hour - 12}:00 PM`;

    timeSlots.push({ value: hourValue, display: hourDisplay });

    const halfHourValue = hour < 10 ? `0${hour}:30` : `${hour}:30`;
    const halfHourDisplay =
      hour < 12
        ? `${hour}:30 AM`
        : hour === 12
        ? `12:30 PM`
        : `${hour - 12}:30 PM`;

    timeSlots.push({ value: halfHourValue, display: halfHourDisplay });
  }

  res.render("therapist/profile-setup", {
    therapist: req.user,
    weekdays: weekdays,
    timeSlots: timeSlots,
    bookedSlots: JSON.stringify({}),
  });
});

router.post(
  "/profile-setup",
  upload.single("profilePicture"),
  async function (req, res) {
    try {
      console.log("Received form data:", req.body);

      if (!req.isAuthenticated()) {
        return res.redirect("/therapist/login");
      }

      if (!req.user.status || req.user.status !== "Pending") {
        return res.redirect("/therapist/dashboard");
      }

      const therapistId = req.user._id;
      const therapist = await TherapistModel.findById(therapistId);

      if (!therapist) {
        return res.status(404).send("Therapist not found");
      }

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
            to: req.body.to ? new Date(req.body.to) : undefined,
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

      const days = Array.isArray(req.body.availableDays)
        ? req.body.availableDays
        : [req.body.availableDays];
      const startTimes = Array.isArray(req.body.startTime)
        ? req.body.startTime
        : [req.body.startTime];
      const endTimes = Array.isArray(req.body.endTime)
        ? req.body.endTime
        : [req.body.endTime];

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
      console.log("Therapist data saved successfully:", therapist);

      req.logout(function (err) {
        if (err) {
          console.error(err);
          return res.status(500).send("Error during logout");
        }

        res.render("therapist/registration-complete");
      });
    } catch (error) {
      console.error("Profile setup error:", error);
      res.status(500).send(`Error updating profile: ${error.message}`);
    }
  }
);
router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }

    res.clearCookie("connect.sid");

    req.session.destroy((err) => {
      if (err) return next(err);
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
      return res.status(400).send("Please fill all fields");
    }
    if (newpass !== confirmpass) {
      return res
        .status(400)
        .send("New Password and Confirm Password do not match");
    }
    if (!therapist) {
      return res.status(404).send("therapist not found");
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
    return res.redirect("/therapist/change-pass");
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || "Error changing password");
  }
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated() && req.user.status) {
    return next();
  }
  res.redirect("/therapist/login");
}
module.exports = router;
