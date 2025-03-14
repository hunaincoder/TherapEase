const express = require("express");
const router = express.Router();
const passport = require("passport");
const authRoutes = require("./patientOauth");
const LocalStrategy = require("passport-local").Strategy;
const patientModel = require("../models/patient");
const TherapistModel = require("../models/therapist");

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

    // Define specialty options for the filter
    const specialtyOptions = ["PTSD", "OCD", "Depression", "Anxiety"];

    // Build the search query object
    let query = { status: "Approved" };

    // Add gender filter if provided
    if (req.query.gender) {
      query.gender = req.query.gender;
    }

    // Add specialties filter if provided
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
    const today = new Date();
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
    const ttoday = new Date();

    const pakistanOffset = 5 * 60 * 60 * 1000;
    const pakistanToday = new Date(ttoday.getTime() + pakistanOffset);

    for (let i = 0; i < 7; i++) {
      const date = new Date(pakistanToday);
      date.setDate(pakistanToday.getDate() + i);

      weekDates.push({
        day: weekDays[date.getDay()],
        shortDay: weekDays[date.getDay()].substring(0, 3),
        date: date.getDate(),
        month: date.toLocaleString("en-US", {
          month: "short",
          timeZone: "Asia/Karachi",
        }),
        year: date.getFullYear(),
        fullDate: date.toISOString().split("T")[0],
      });
    }


    console.log("Raw availability from DB:", therapist.availability);

    const formattedAvailability = {};

    weekDays.forEach((day) => {
      formattedAvailability[day] = [];
    });

    if (therapist.availability && therapist.availability.length > 0) {
      therapist.availability.forEach((slot) => {
        const day = slot.day;

        const startTimeParts = slot.startTime.split(":");
        const endTimeParts = slot.endTime.split(":");

        const startHour = parseInt(startTimeParts[0]);
        const startMinute = parseInt(startTimeParts[1] || 0);
        const endHour = parseInt(endTimeParts[0]);
        const endMinute = parseInt(endTimeParts[1] || 0);

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

    console.log("Formatted availability:", formattedAvailability);
    res.render("patient/therapist-booking", {
      patient,
      therapist,
      weekDates,
      formattedAvailability,
    });
  } catch (error) {
    console.error(error);
  }
});

router.get("/checkout", isLoggedIn, function (req, res) {
  res.render("patient/checkout");
});
router.get("/booking-success", isLoggedIn, function (req, res) {
  res.render("patient/booking-success");
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

router.get("/invoices", isLoggedIn, function (req, res) {
  res.render("patient/invoices");
});
router.get("/invoice", isLoggedIn, function (req, res) {
  res.render("patient/invoice");
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
