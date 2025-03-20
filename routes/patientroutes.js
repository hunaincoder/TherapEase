const express = require("express");
const router = express.Router();
const passport = require("passport");
const authRoutes = require("./patientOauth");
const LocalStrategy = require("passport-local").Strategy;
const patientModel = require("../models/patient");
const TherapistModel = require("../models/therapist");
const moment = require("moment-timezone");
const AppointmentModel = require("../models/appointments");
const TransactionModel = require("../models/transaction");
const flash = require("connect-flash");

router.use(authRoutes);

passport.use(
  "patient-local",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const patient = await patientModel.findOne({ email });

        if (!patient) {
          return done(null, false, { message: "Invalid email or password" });
        }

        patient.authenticate(password, (err, user, passwordError) => {
          if (err || passwordError) {
            return done(null, false, { message: "Invalid email or password" });
          }

          return done(null, patient);
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

router.get("/login", function (req, res) {
  res.render("patient/login");
});

router.post("/login", (req, res, next) => {
  passport.authenticate("patient-local", (err, user, info) => {
    if (err) {
      console.error("Authentication error:", err);
      return res.status(500).send("Authentication error");
    }
    if (!user) {
      console.log("Login failed:", info.message);
      return res.status(400).send(info.message);
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error("Login error:", loginErr);
        return res.status(500).send("Login failed");
      }
      res.redirect("/client/dashboard");
    });
  })(req, res, next);
});

router.get("/register", function (req, res) {
  res.render("patient/register");
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

    const existingPatient = await patientModel.findOne({ email: email });
    if (existingPatient) {
      return res.status(400).send("Email already in use");
    }

    const patient = new patientModel({
      username,
      email,
      password,
    });

    patientModel.register(patient, password, async function (err, newPatient) {
      if (err) {
        console.error(err);
        return res.status(500).send("Error registering patient");
      }

      req.login(newPatient, (loginErr) => {
        if (loginErr) {
          return res
            .status(500)
            .send("Registration successful, but login failed");
        }
        res.redirect("/client/dashboard");
      });
    });
  } catch (err) {
    console.log(err);
    res.status(400).send("Error occurred during signup");
  }
});

router.get("/dashboard", isLoggedIn, function (req, res) {
  res.render("patient/dashboard");
});

router.get("/therapist-search", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });

    const specialtyOptions = ["PTSD", "OCD", "Depression", "Anxiety"];

    let query = { status: "Approved" };

    if (req.query.gender) {
      query.gender = req.query.gender;
    }

    if (req.query.specialties) {
      const specialtiesParam = Array.isArray(req.query.specialties)
        ? req.query.specialties
        : [req.query.specialties];

      const validSpecialties = specialtiesParam.filter((specialty) =>
        specialtyOptions.includes(specialty)
      );

      if (validSpecialties.length > 0) {
        query.specialties = { $in: validSpecialties };
      }
    }

    const therapists = await TherapistModel.find(query).lean();

    const selectedSpecialties = Array.isArray(req.query.specialties)
      ? req.query.specialties
      : req.query.specialties
      ? [req.query.specialties]
      : [];

    res.render("patient/therapist-search", {
      patient,
      therapists,
      selectedGender: req.query.gender || "",
      selectedSpecialties,
      specialtyOptions,
    });
  } catch (error) {
    console.error("Error in therapist search:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/therapist-profile/:id", isLoggedIn, async (req, res) => {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      return res.status(404).send("Therapist not found");
    }
    console.log("Fetched therapist availability:", therapist.availability);

    res.render("patient/therapist-profile", {
      patient,
      therapist: therapist,
      availability: therapist.availability || [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching therapist profile");
  }
});

router.get("/therapist-profile", isLoggedIn, function (req, res) {
  res.render("patient/therapist-profile");
});

router.get("/therapist-booking/:id", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      return res.status(404).send("Therapist not found");
    }

    const today = moment().tz("Asia/Karachi");
    const weekDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const weekDates = [];

    for (let i = 0; i < 7; i++) {
      const date = today.clone().add(i, "days");
      const dayIndex = date.day() === 0 ? 6 : date.day() - 1;
      weekDates.push({
        day: weekDays[dayIndex],
        shortDay: weekDays[dayIndex].substring(0, 3),
        date: date.date(),
        month: date.format("MMM"),
        year: date.year(),
        fullDate: date.format("YYYY-MM-DD"),
      });
    }

    const existingAppointments = await AppointmentModel.find({
      therapistId: therapist._id,
    });

    const formattedAvailability = weekDates.map((dateInfo) => {
      const dayAvailability = therapist.availability.find(
        (slot) => slot.day === dateInfo.day
      );

      if (!dayAvailability) {
        return { ...dateInfo, slots: [] };
      }

      const [startHour, startMinute] = dayAvailability.startTime
        .split(":")
        .map(Number);
      const [endHour, endMinute] = dayAvailability.endTime
        .split(":")
        .map(Number);

      let currentHour = startHour;
      let currentMinute = startMinute;
      const slots = [];

      while (
        currentHour < endHour ||
        (currentHour === endHour && currentMinute < endMinute)
      ) {
        const slotStart = `${currentHour}:${currentMinute
          .toString()
          .padStart(2, "0")}`;
        const slotEndMinute = currentMinute + 30;
        const slotEndHour = currentHour + Math.floor(slotEndMinute / 60);
        const formattedEndMinute = slotEndMinute % 60;

        const isBooked = existingAppointments.some((appt) => {
          const apptDate = moment(appt.date)
            .tz("Asia/Karachi")
            .format("YYYY-MM-DD");
          return apptDate === dateInfo.fullDate && appt.time === slotStart;
        });

        if (!isBooked) {
          slots.push({
            time: `${slotStart}-${slotEndHour}:${formattedEndMinute
              .toString()
              .padStart(2, "0")}`,
            display: `${moment(slotStart, "HH:mm").format("h:mm A")} - ${moment(
              `${slotEndHour}:${formattedEndMinute}`,
              "HH:mm"
            ).format("h:mm A")}`,
          });
        }

        currentMinute += 30;
        if (currentMinute >= 60) {
          currentHour += 1;
          currentMinute = 0;
        }
      }

      return { ...dateInfo, slots };
    });

    res.render("patient/therapist-booking", {
      patient,
      therapist,
      weekDates,
      formattedAvailability,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

function formatTherapistAvailability(availability) {
  const formattedAvailability = {};
  const today = moment().tz("Asia/Karachi");

  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  weekDays.forEach((day) => (formattedAvailability[day] = []));

  if (availability && availability.length > 0) {
    availability.forEach((slot) => {
      const day = slot.day;
      const [startHour, startMinute] = slot.startTime.split(":").map(Number);
      const [endHour, endMinute] = slot.endTime.split(":").map(Number);

      let currentHour = startHour;
      let currentMinute = startMinute;

      while (
        currentHour < endHour ||
        (currentHour === endHour && currentMinute < endMinute)
      ) {
        let slotEndHour = currentHour;
        let slotEndMinute = currentMinute + 30;

        if (slotEndMinute >= 60) {
          slotEndHour += 1;
          slotEndMinute -= 60;
        }

        if (
          slotEndHour < endHour ||
          (slotEndHour === endHour && slotEndMinute <= endMinute)
        ) {
          const displayStart = `${
            currentHour > 12 ? currentHour - 12 : currentHour
          }:${currentMinute.toString().padStart(2, "0")}`;
          const displayEnd = `${
            slotEndHour > 12 ? slotEndHour - 12 : slotEndHour
          }:${slotEndMinute.toString().padStart(2, "0")}`;
          const periodStart = currentHour >= 12 ? "PM" : "AM";
          const periodEnd = slotEndHour >= 12 ? "PM" : "AM";

          formattedAvailability[day].push({
            time: `${currentHour}:${currentMinute
              .toString()
              .padStart(2, "0")}-${slotEndHour}:${slotEndMinute
              .toString()
              .padStart(2, "0")}`,
            display: `${displayStart} - ${displayEnd}`,
            period:
              periodStart === periodEnd
                ? periodStart
                : `${periodStart}-${periodEnd}`,
          });
        }

        currentMinute += 30;
        if (currentMinute >= 60) {
          currentHour += 1;
          currentMinute -= 60;
        }
      }
    });
  }

  return formattedAvailability;
}

router.get("/checkout/:id", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      return res.status(404).send("Therapist not found");
    }

    const { day, date, time } = req.query;

    if (!day || !date || !time) {
      return res.status(400).send("Missing booking parameters");
    }

    const dateMoment = moment.tz(req.query.date, "YYYY-MM-DD", "Asia/Karachi");
    if (!dateMoment.isValid()) {
      return res.status(400).send("Invalid date format");
    }

    res.render("patient/checkout", {
      therapist,
      patient,
      selectedDay: day,
      selectedTime: time,
      selectedDate: dateMoment.format("YYYY-MM-DD"),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/confirm-booking", isLoggedIn, async function (req, res) {
  try {
    const { therapistId, selectedDate, selectedTime, sessionType } = req.body;
    const patient = await patientModel.findOne({ email: req.user.email });
    const patientId = patient._id;

    if (!therapistId || !selectedDate || !selectedTime || !sessionType) {
      return res.status(400).send("Missing required feilds");
    }

    const appointmentMoment = moment.tz(
      selectedDate,
      "YYYY-MM-DD",
      "Asia/Karachi"
    );

    if (!appointmentMoment.isValid()) {
      return res.status(400).send("Invalid date format");
    }

    const appointmentDate = appointmentMoment.utc().toDate();
    const [startTime] = selectedTime.split("-");

    const existing = await AppointmentModel.findOne({
      therapistId,
      patientId,
      date: appointmentDate,
      time: startTime.trim(),
    });
    if (existing) {
      req.flash("error", "This time slot is already booked");
      return res.redirect("back");
    }
    const appointment = new AppointmentModel({
      therapistId,
      patientId,
      date: appointmentDate,
      time: startTime.trim(),
      sessionType: sessionType || "video",
      status: "Scheduled",
    });

    await appointment.save();

    req.session.appointmentId = appointment._id;

    const therapist = await TherapistModel.findById(therapistId);
    const fee = therapist.fee;
    const tax = fee * 0.1;

    const transaction = new TransactionModel({
      patient: patientId,
      therapist: therapistId,
      appointment: appointment._id,
      amount: fee,
      tax: tax,
      totalAmount: fee + tax,
      paymentMethod: "Credit Card",
      status: "completed",
      invoiceNumber: `INV-${Date.now()}`,
    });
    await transaction.save();

    res.redirect("/client/booking-success");
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).send("Error processing booking");
  }
});

router.get("/booking-success", isLoggedIn, async function (req, res) {
  try {
    if (!req.session.appointmentId) {
      return res.redirect("/client/dashboard");
    }

    const appointment = await AppointmentModel.findById(
      req.session.appointmentId
    )
      .populate("therapistId")
      .populate("patientId");

    if (!appointment) {
      return res.status(404).send("Appointment not found");
    }

    const dateObj = moment(appointment.date).tz("Asia/Karachi");
    const formattedDate = `${getOrdinal(dateObj.date())} ${dateObj.format(
      "dddd"
    )}`;

    const startTime = moment
      .tz(appointment.time, "HH:mm", "Asia/Karachi")
      .format("h:mm A");
    const endTime = moment
      .tz(appointment.time, "HH:mm", "Asia/Karachi")
      .add(30, "minutes")
      .format("h:mm A");

    res.render("patient/booking-success", {
      appointment: {
        ...appointment._doc,
        formattedDate,
        time: `${startTime} to ${endTime}`,
      },
    });

    delete req.session.appointmentId;
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving booking details");
  }
});

router.get("/pass-change", isLoggedIn, function (req, res) {
  res.render("patient/pass-change");
});

router.get("/profile", isLoggedIn, async function (req, res) {
  const patient = await patientModel.findOne({ email: req.user.email });
  res.render("patient/profile", { patient });
});

router.post("/profile/update", isLoggedIn, async function (req, res) {
  try {
    const clientId = req.user._id;
    const updatedData = {
      firstname: req.body.firstName,
      lastname: req.body.lastname,
      dob: req.body.dob,
      email: req.body.email,
      mobile: req.body.mobile,
      city: req.body.city,
      country: req.body.country,
      updatedAt: new Date(),
    };

    await patientModel.findByIdAndUpdate(clientId, updatedData, { new: true });

    res.redirect("/client/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
});

router.get("/invoices", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const patientId = patient._id;
    
    const transactions = await TransactionModel.find({ patient: patientId })
      .populate({
        path: "appointment",
        populate: [
          { path: "therapistId", model: "Therapist" },
          { path: "patientId", model: "Patient" },
        ],
      })
      .sort({ date: -1 });

    res.render("patient/invoices", {
      transactions: transactions.map((t) => ({
        ...t._doc,
        formattedDate: moment(t.date).format("MMM D, YYYY"),
        appointmentDate: moment(t.appointment.date).format("MMM D, YYYY"),
      })),
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/invoice/:id", isLoggedIn, async function (req, res) {
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

    res.render("patient/invoice", {
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
      },
      patient: appointment.patientId,
      therapist: appointment.therapistId,
    });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/accounts", isLoggedIn, function (req, res) {
  res.render("patient/accounts");
});

router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }

    res.clearCookie("connect.sid");

    req.session.destroy((err) => {
      if (err) return next(err);
      res.redirect("/client/login");
    });
  });
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/client/login");
}

module.exports = router;
