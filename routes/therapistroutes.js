const express = require("express");
const router = express.Router();
const passport = require("passport");
const authRoutes = require("./TherapistOauth");
const LocalStrategy = require("passport-local").Strategy;
const TherapistModel = require("../models/therapist");
const multer = require("multer");
const path = require("path");

router.use(authRoutes);

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

router.get("/dashboard", isLoggedIn, (req, res) => {
  res.render("therapist/dashboard", { therapist: req.user });
});

router.get("/appointment-confirmation", isLoggedIn, (req, res) => {
  res.render("therapist/appointment-confirmation", { therapist: req.user });
});

router.get("/availability", isLoggedIn, (req, res) => {
  res.render("therapist/availability", { therapist: req.user });
});

router.get("/change-pass", isLoggedIn, (req, res) => {
  res.render("therapist/change-pass", { therapist: req.user });
});

router.get("/invoices", isLoggedIn, (req, res) => {
  res.render("therapist/invoices", { therapist: req.user });
});

router.get("/invoice", isLoggedIn, (req, res) => {
  res.render("therapist/invoice", { therapist: req.user });
});

router.get("/payout", isLoggedIn, (req, res) => {
  res.render("therapist/payout", { therapist: req.user });
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

  // Create time slots with 30-minute increments
  const timeSlots = [];
  for (let hour = 8; hour <= 20; hour++) {
    // Add the hour (e.g., 8:00 AM)
    const hourValue = hour < 10 ? `0${hour}:00` : `${hour}:00`;
    const hourDisplay =
      hour < 12
        ? `${hour}:00 AM`
        : hour === 12
        ? `12:00 PM`
        : `${hour - 12}:00 PM`;

    timeSlots.push({ value: hourValue, display: hourDisplay });

    // Add the half hour (e.g., 8:30 AM)
    const halfHourValue = hour < 10 ? `0${hour}:30` : `${hour}:30`;
    const halfHourDisplay =
      hour < 12
        ? `${hour}:30 AM`
        : hour === 12
        ? `12:30 PM`
        : `${hour - 12}:30 PM`;

    timeSlots.push({ value: halfHourValue, display: halfHourDisplay });
  }

  // Get the therapist with their availability
  const therapist = await TherapistModel.findById(req.user._id).lean();

  // Create a map of already booked slots
  const bookedSlots = {};
  if (therapist.availability && therapist.availability.length > 0) {
    therapist.availability.forEach((slot) => {
      if (slot.day && slot.startTime && slot.endTime) {
        if (!bookedSlots[slot.day]) {
          bookedSlots[slot.day] = [];
        }

        // Add all time slots between start and end to the booked slots
        let currentSlot = slot.startTime;
        while (currentSlot !== slot.endTime) {
          bookedSlots[slot.day].push(currentSlot);

          // Move to the next 30-minute slot
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
