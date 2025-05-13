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
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");
const upload = multer();
const axios = require("axios");
const FormData = require("form-data");

router.use(flash());
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

const problemToSpecialtyMap = {
  anxiety: "Anxiety",
  depression: "Depression",
  ptsd: "PTSD",
  ocd: "OCD",
  stress: "Anxiety",
  grief: "Grief",
  insomnia: "Sleep Disorder",
  "social anxiety": "Anxiety",
  "self-esteem": "Self-Esteem",
  "body image": "Body Image",
  addiction: "Addiction",
};

function extractProblem(primaryConcern, recommendedScale) {
  if (!primaryConcern && !recommendedScale) return null;

  const lowerConcern = (primaryConcern || "").toLowerCase();
  for (const problem in problemToSpecialtyMap) {
    if (lowerConcern.includes(problem)) {
      return problemToSpecialtyMap[problem];
    }
  }

  if (recommendedScale) {
    const scaleName = recommendedScale.toLowerCase();
    for (const problem in problemToSpecialtyMap) {
      if (scaleName.includes(problem)) {
        return problemToSpecialtyMap[problem];
      }
    }
  }

  return null;
}

let recordingCount = 1;

const audioStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const dir = path.join(__dirname, "../assets/audio/recordings");
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      console.error("Error creating directory:", err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const newFilename = `recording${recordingCount}.mp3`;
    recordingCount++;
    cb(null, newFilename);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  fileFilter: (req, file, cb) => {
    console.log("Received file:", file.originalname, "type:", file.mimetype);
    if (
      file.mimetype === "audio/mp3" ||
      file.mimetype === "audio/mpeg" ||
      file.mimetype === "audio/webm"
    ) {
      cb(null, true);
    } else {
      console.warn(`Rejected file of type ${file.mimetype}`);
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Only MP3 and WebM files are allowed`
        ),
        false
      );
    }
  },
});

const handleAudioUpload = (req, res, next) => {
  audioUpload.single("audio")(req, res, (err) => {
    if (err) {
      console.error("Multer error:", err);
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            success: false,
            message: "File too large. Maximum size is 50MB",
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next();
  });
};

router.post(
  "/save-recording",
  isLoggedIn,
  handleAudioUpload,
  async (req, res) => {
    console.log("Processing save-recording request");

    try {
      const { appointmentId, userId, isTherapist } = req.body;

      console.log("Save recording params:", {
        appointmentId,
        userId,
        isTherapist,
      });

      if (
        !mongoose.Types.ObjectId.isValid(appointmentId) ||
        !mongoose.Types.ObjectId.isValid(userId)
      ) {
        console.error("Invalid IDs:", { appointmentId, userId });
        return res
          .status(400)
          .json({ success: false, message: "Invalid appointment or user ID" });
      }

      const appointment = await AppointmentModel.findById(appointmentId);
      if (!appointment) {
        console.error("Appointment not found:", appointmentId);
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found" });
      }

      const isValidUser =
        (isTherapist === "true" &&
          appointment.therapistId.toString() === userId) ||
        (isTherapist === "false" &&
          appointment.patientId.toString() === userId);

      if (!isValidUser) {
        console.error("Unauthorized user:", { userId, isTherapist });
        return res.status(403).json({
          success: false,
          message: "Unauthorized to save recording for this appointment",
        });
      }

      if (!req.file) {
        console.error("No file in request");
        return res
          .status(400)
          .json({ success: false, message: "No audio file uploaded" });
      }

      console.log("File saved:", req.file.path);

      appointment.recording = {
        path: `/audio/recordings/${req.file.filename}`,
        recordedBy: new mongoose.Types.ObjectId(userId),
        recordedAt: new Date(),
        isTherapist: isTherapist === "true",
      };

      await appointment.save();
      console.log("Appointment updated with recording info");

      if (isTherapist === "true") {
        const filePath = encodeURIComponent(
          `/audio/recordings/${req.file.filename}`
        );  
        return res.redirect(
          `http://localhost:8003/static/upload.html?appointmentId=${appointmentId}&file=${filePath}`
        );
      }

      res.json({ success: true, message: "Recording saved successfully" });
    } catch (error) {
      console.error("Error saving recording:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save recording: " + error.message,
      });
    }
  }
);

router.get("/login", function (req, res) {
  res.render("patient/login", { messages: req.flash() });
});

router.post("/login", (req, res, next) => {
  passport.authenticate("patient-local", (err, user, info) => {
    if (err) {
      console.error("Authentication error:", err);
      req.flash("error", "Authentication error");
      return res.redirect("/client/login");
    }
    if (!user) {
      console.log("Login failed:", info.message);
      req.flash("error", info.message);
      return res.redirect("/client/login");
    }
    req.login(user, async (loginErr) => {
      if (loginErr) {
        console.error("Login error:", loginErr);
        req.flash("error", "Login failed");
        return res.redirect("/client/login");
      }
      if (!user.hasCompletedScreening) {
        req.flash(
          "success",
          "Successfully logged in. Please complete the screening."
        );
        return res.redirect("/client/screening");
      }
      req.flash("success", "Successfully logged in");
      res.redirect("/client/dashboard");
    });
  })(req, res, next);
});

router.get("/register", function (req, res) {
  res.render("patient/register", { messages: req.flash() });
});

router.post("/register", async function (req, res) {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      req.flash("error", "All fields are required");
      return res.redirect("/client/register");
    }

    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(email)) {
      req.flash("error", "Invalid email format");
      return res.redirect("/client/register");
    }

    const existingPatient = await patientModel.findOne({ email: email });
    if (existingPatient) {
      req.flash("error", "Email already in use");
      return res.redirect("/client/register");
    }

    const patient = new patientModel({
      username,
      email,
      password,
    });

    patientModel.register(patient, password, async function (err, newPatient) {
      if (err) {
        console.error(err);
        req.flash("error", "Error registering patient");
        return res.redirect("/client/register");
      }

      req.login(newPatient, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          req.flash("error", "Registration successful, but login failed");
          return res.redirect("/client/register");
        }
        req.flash("success", "Successfully registered and logged in");
        if (!newPatient.hasCompletedScreening) {
          req.flash(
            "success",
            "Successfully registered. Please complete the screening."
          );
          req.session.save((err) => {
            if (err) {
              console.error("Error saving session:", err);
              req.flash("error", "Failed to save session");
              return res.redirect("/client/register");
            }
            res.redirect("/client/screening");
          });
          return;
        }
        req.session.save((err) => {
          if (err) {
            console.error("Error saving session:", err);
            req.flash("error", "Failed to save session");
            return res.redirect("/client/register");
          }
          res.redirect("/client/dashboard");
        });
      });
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Error occurred during signup");
    res.redirect("/client/register");
  }
});

router.get("/screening", isLoggedIn, (req, res) => {
  res.redirect("http://localhost:8001/static/index.html");
});

router.get("/followup", isLoggedIn, (req, res) => {
  res.redirect("http://localhost:8001/static/followup.html");
});

router.get("/normal", isLoggedIn, (req, res) => {
  res.redirect("http://localhost:8001/static/normal.html");
});

router.post("/followup", isLoggedIn, upload.none(), async (req, res) => {
  try {
    const { answers, finalScale, rationale } = req.body;

    console.log("Received followup data:", {
      answers,
      finalScale,
      rationale,
    });

    if (!finalScale || !rationale) {
      throw new Error("finalScale and rationale are required");
    }

    const updatedPatient = await patientModel.findByIdAndUpdate(
      req.user._id,
      {
        hasCompletedScreening: false,
        recommendedScale: finalScale,
        rationale: rationale,
      },
      { new: true }
    );

    console.log("Updated patient in database:", updatedPatient);

    return res.json({
      redirect: `/client/scale/${finalScale.replace(/ /g, "_")}`,
    });
  } catch (error) {
    console.error("Follow-up error:", error);
    req.flash("error", `Error processing follow-up: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/submit-followup", isLoggedIn, async (req, res) => {
  console.log("Received request to /submit-followup");
  console.log("Request body:", req.body);
  console.log("Session:", req.session);
  console.log("User:", req.user);

  const { scale, confidence, rationale } = req.body;

  if (!scale || !rationale) {
    console.log("Missing scale or rationale");
    return res.status(400).json({ error: "Scale and rationale are required." });
  }

  try {
    const updatedPatient = await patientModel.findByIdAndUpdate(
      req.user._id,
      {
        hasCompletedScreening: false,
        recommendedScale: scale,
        confidence: confidence || null,
        rationale: rationale,
      },
      { new: true }
    );

    console.log("Updated patient with follow-up data:", updatedPatient);

    return res.json({
      redirect: `/client/scale/${scale.replace(/ /g, "_")}`,
    });
  } catch (err) {
    console.error("Error submitting follow-up:", err);
    res.status(500).json({ error: "Failed to submit follow-up." });
  }
});

router.get("/scale/:scaleName", isLoggedIn, async (req, res) => {
  const scaleName = req.params.scaleName.replace(/_/g, " ");
  const patient = await patientModel.findById(req.user._id);

  const scaleFileMap = {
    "Anxiety (GAD-7)": "gad7",
    "Body Image (BSQ)": "bsq",
    "Depression (PHQ 9)": "phq9",
    "PTSD (PCL-5)": "pcl5",
    "Alcohol Use (AUDIT)": "audit",
    "Drug Use (DAST-10)": "dast10",
    "Grief and Loss (ICG)": "icg",
    "Identity Crisis (SCS)": "scs",
    "OCD (OCI-R)": "ocir",
    "Self-Esteem (Rosenberg Self-Esteem Scale)": "rosenberg",
    "Sleep disorder (ESS)": "ess",
    "Sleep Disorder Insomnia (ISI)": "isi",
    "Social Anxiety (LSAS)": "lsas",
    "Stress (PSS)": "pss",
  };

  const scaleFile =
    scaleFileMap[scaleName] || scaleName.replace(/ \(.+\)/, "").toLowerCase();

  console.log(`Rendering scale: ${scaleName}, file: scales/${scaleFile}`);

  try {
    res.render(`scales/${scaleFile}`, {
      patient,
      recommendedScale: scaleName,
      rationale: patient.rationale,
      messages: req.flash(),
    });
  } catch (error) {
    console.error(`Error rendering scale ${scaleFile}:`, error);
    req.flash("error", "Scale not found or rendering failed");
    res.redirect("/client/dashboard");
  }
});

router.post("/save-scale-results", isLoggedIn, async (req, res) => {
  try {
    const { scaleName, totalScore, severity, badge } = req.body;

    if (!scaleName || typeof totalScore !== "number" || !severity || !badge) {
      return res.status(400).json({ error: "Invalid scale results data" });
    }

    if (totalScore < 0) {
      return res.status(400).json({ error: "Total score cannot be negative" });
    }

    const updatedPatient = await patientModel.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          [`scaleResults.${scaleName}`]: {
            totalScore,
            severity,
            badge,
          },
        },
      },
      { new: true }
    );

    console.log("Updated patient with scale results:", updatedPatient);

    return res.status(200).json({ redirect: "/client/patient-profile" });
  } catch (error) {
    console.error("Error saving scale results:", error);
    return res.status(500).json({ error: "Failed to save scale results" });
  }
});

router.get("/patient-profile", isLoggedIn, (req, res) => {
  res.render("patient/patientProfile", {
    messages: req.flash(),
    patient: req.user,
  });
});

router.post("/patient-profile", isLoggedIn, async (req, res) => {
  try {
    const {
      name,
      age,
      sex,
      occupation,
      maritalStatus,
      familyStructure,
      headOfFamily,
      headOfFamilyContact,
    } = req.body;

    if (
      !name ||
      !age ||
      !sex ||
      !maritalStatus ||
      !familyStructure ||
      !headOfFamily ||
      !headOfFamilyContact
    ) {
      req.flash("error", "All required fields must be filled");
      return res.redirect("/client/patient-profile");
    }

    const updatedPatient = await patientModel.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          name,
          age: parseInt(age),
          gender: sex,
          occupation,
          maritalStatus,
          familyStructure,
          headOfFamily,
          headOfFamilyContact,
        },
      },
      { new: true }
    );

    console.log("Updated patient with profile data:", updatedPatient);

    return res.status(200).json({ redirect: "/client/therapy-profile" });
  } catch (error) {
    console.error("Error saving patient profile:", error);
    req.flash("error", "Failed to save patient profile");
    res.redirect("/client/patient-profile");
  }
});

router.get("/therapy-profile", isLoggedIn, (req, res) => {
  res.render("patient/TherapyProfile", {
    messages: req.flash(),
    patient: req.user,
  });
});

router.post("/therapy-profile", isLoggedIn, async (req, res) => {
  try {
    const { q1, q2, q3, q4, q5 } = req.body;

    if (![q1, q2, q3, q4, q5].every(Boolean)) {
      return res.status(400).json({ error: "All questions must be answered" });
    }

    const therapyProfileData = { q1, q2, q3, q4, q5 };

    const response = await axios.post(
      "http://localhost:8000/generate-summary",
      therapyProfileData,
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data.status !== "success" || !response.data.summary) {
      throw new Error(
        "Failed to generate therapy profile summary: " +
          (response.data.message || response.data.error || "Unknown error")
      );
    }

    const summary = response.data.summary;

    const requiredFields = [
      "primary_concern",
      "impact",
      "past_experiences",
      "emotional_state",
      "behavior_patterns",
      "therapy_history",
      "support_system",
      "therapy_goals",
      "therapist_preferences",
    ];
    if (!requiredFields.every((field) => field in summary)) {
      throw new Error("Incomplete therapy profile summary received");
    }

    const updatedPatient = await patientModel.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          therapyProfile: summary,
          hasCompletedScreening: true,
        },
      },
      { new: true }
    );

    if (!updatedPatient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    console.log("Updated patient with therapy profile:", updatedPatient);

    let patientBadge = null;
    let patientProblem = null;

    if (updatedPatient.scaleResults && updatedPatient.recommendedScale) {
      const scaleResult = updatedPatient.scaleResults.get(
        updatedPatient.recommendedScale
      );
      if (scaleResult) {
        patientBadge = scaleResult.badge || null;
        console.log("Extracted scale result:", {
          patientBadge,
        });
      } else {
        console.warn(
          "No scale result found for recommendedScale:",
          updatedPatient.recommendedScale
        );
      }
    } else {
      console.warn("Missing scaleResults or recommendedScale:", {
        scaleResults: updatedPatient.scaleResults,
        recommendedScale: updatedPatient.recommendedScale,
      });
    }

    patientProblem = extractProblem(
      updatedPatient.therapyProfile.primary_concern,
      updatedPatient.recommendedScale
    );

    if (patientBadge && isNaN(parseInt(patientBadge, 10))) {
      console.warn(
        `Invalid patientBadge value: ${patientBadge}. Setting to null.`
      );
      patientBadge = null;
    }

    const queryParams = new URLSearchParams();
    if (patientBadge) queryParams.append("badge", patientBadge);
    if (patientProblem) queryParams.append("specialties", patientProblem);

    console.log("Redirect query parameters:", queryParams.toString());

    return res.status(200).json({
      message: "Screening process completed successfully",
      redirect: `/client/therapist-search?${queryParams.toString()}`,
      summary,
    });
  } catch (error) {
    console.error("Error processing therapy profile:", error.message);
    return res.status(500).json({
      error: "Failed to process therapy profile",
      details: error.message,
    });
  }
});

router.get("/dashboard", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const filter = req.query.filter || "Upcoming";

    let query = { patientId: patient._id };

    switch (filter) {
      case "Cancelled":
        query.status = "Cancelled";
        break;
      case "Completed":
        query.status = "Completed";
        break;
      case "Upcoming":
      default:
        query.status = "Scheduled";
        break;
    }

    const appointments = await AppointmentModel.find(query)
      .populate("therapistId")
      .sort({ date: 1 });

    const appointmentIds = appointments.map((appt) => appt._id);
    const transactions = await TransactionModel.find({
      appointment: { $in: appointmentIds },
    });

    const formattedAppointments = appointments.map((appt) => {
      const appointmentDateTime = moment.tz(
        `${moment(appt.date).format("YYYY-MM-DD")} ${appt.time}`,
        "YYYY-MM-DD HH:mm",
        "Asia/Karachi"
      );

      const windowStart = moment(appointmentDateTime).subtract(5, "minutes");
      const windowEnd = moment(appointmentDateTime).add(30, "minutes");
      const now = moment().tz("Asia/Karachi");

      return {
        ...appt._doc,
        videocallended: appt.videocallended || false,
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

    const counts = {
      upcoming: await AppointmentModel.countDocuments({
        patientId: patient._id,
        status: "Scheduled",
        date: { $gte: new Date() },
      }),
      cancelled: await AppointmentModel.countDocuments({
        patientId: patient._id,
        status: "Cancelled",
      }),
      completed: await AppointmentModel.countDocuments({
        patientId: patient._id,
        status: "Completed",
      }),
    };

    res.render("patient/dashboard", {
      appointments: formattedAppointments,
      counts,
      currentFilter: filter,
      moment: moment,
      patient: req.user,
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/login");
  }
});

router.get("/therapist-search", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({
      email: { $regex: `^${req.user.email}$`, $options: "i" },
    });

    const specialtyOptions = [
      "PTSD",
      "OCD",
      "Depression",
      "Anxiety",
      "Grief",
      "Addiction",
      "Sleep Disorder",
      "Self-Esteem",
      "Body Image",
    ];

    let query = { status: { $regex: "^Approved$", $options: "i" } };

    if (req.query.badge) {
      const badgeValue = parseInt(req.query.badge, 10);
      if (!isNaN(badgeValue)) {
        query.badge = badgeValue;
      } else {
        console.warn(`Invalid badge value received: ${req.query.badge}`);
      }
    }

    if (req.query.specialties) {
      const specialtiesParam = Array.isArray(req.query.specialties)
        ? req.query.specialties
        : [req.query.specialties];

      const validSpecialties = specialtiesParam.filter((specialty) =>
        specialtyOptions.some(
          (opt) => opt.toLowerCase() === specialty.toLowerCase()
        )
      );

      if (validSpecialties.length > 0) {
        query.specialties = {
          $in: validSpecialties.map((s) => new RegExp(`^${s}$`, "i")),
        };
      }
    }

    if (req.query.gender) {
      query.gender = { $regex: `^${req.query.gender}$`, $options: "i" };
    }

    if (req.query.severity) {
      console.log("Received severity filter:", req.query.severity);
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
      selectedBadge: req.query.badge || "",
      selectedSeverity: req.query.severity || "",
      specialtyOptions,
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error in therapist search:", error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/dashboard");
  }
});

router.get("/video-call/:id", isLoggedIn, async (req, res) => {
  try {
    const appointmentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      console.error(`Invalid appointment ID format: ${appointmentId}`);
      req.flash("error", "Invalid appointment ID format");
      return res.redirect("/client/dashboard");
    }

    const appointment = await AppointmentModel.findById(appointmentId)
      .populate("patientId")
      .populate("therapistId");

    if (!appointment) {
      console.error(`Appointment not found for ID: ${appointmentId}`);
      req.flash("error", "Appointment not found");
      return res.redirect("/client/dashboard");
    }

    if (
      appointment.patientId._id.toString() !== req.user._id.toString() &&
      appointment.therapistId._id.toString() !== req.user._id.toString()
    ) {
      console.error(`Unauthorized access attempt by user: ${req.user._id}`);
      req.flash("error", "Unauthorized access");
      return res.redirect("/client/dashboard");
    }

    if (appointment.status !== "Scheduled") {
      req.flash("error", "This appointment is not active");
      return res.redirect("/client/dashboard");
    }

    if (appointment.sessionType !== "video") {
      req.flash("error", "This appointment is not a video call");
      return res.redirect("/client/dashboard");
    }

    if (!moment().isSame(moment(appointment.date), "day")) {
      req.flash("error", "This appointment is not scheduled for today");
      return res.redirect("/client/dashboard");
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
      return res.redirect("/client/dashboard");
    }

    if (now.isAfter(windowEnd)) {
      req.flash("error", "Call has ended");
      return res.redirect("/client/dashboard");
    }

    res.render("shared/video-call", {
      user: req.user,
      appointment,
      sessionPartnerName: req.user._id.equals(appointment.therapistId._id)
        ? `${appointment.patientId.firstname} ${appointment.patientId.lastname}`
        : `${appointment.therapistId.firstName} ${appointment.therapistId.lastName}`,
      displayName: req.user.firstname
        ? `${req.user.firstname} ${req.user.lastname || ""}`
        : req.user.username,
      isTherapist: false,
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
    res.redirect("/client/dashboard");
  }
});

router.get("/therapy-reports", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const appointments = await AppointmentModel.find({
      patientId: patient._id,
    });

    const reportIds = appointments.map((appt) => appt._id.toString());
    const reports = await mongoose.connection.db
      .collection("after_therapy_reports")
      .find({
        sessionId: { $in: reportIds },
      })
      .toArray();

    const populatedReports = await Promise.all(
      reports.map(async (report) => {
        const appointment = await AppointmentModel.findById(
          report.sessionId
        ).populate("therapistId", "firstName lastName profilePicture");

        return {
          ...report,
          therapistName: appointment?.therapistId
            ? `${appointment.therapistId.firstName} ${appointment.therapistId.lastName}`
            : "Unknown",
          therapistProfilePicture:
            appointment?.therapistId?.profilePicture ||
            "/img/doctors/doctor-thumb-01.jpg",
          formattedDate: moment(report.timestamp).format("MMM D, YYYY"),
        };
      })
    );

    res.render("patient/therapy-reports", {
      patient,
      reports: populatedReports,
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error fetching therapy reports:", error);
    req.flash("error", "Error fetching therapy reports");
    res.redirect("/client/dashboard");
  }
});

router.get("/therapy-reports/:id", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const report = await mongoose.connection.db
      .collection("after_therapy_reports")
      .findOne({
        _id: new mongoose.Types.ObjectId(req.params.id),
      });

    if (!report) {
      req.flash("error", "Report not found");
      return res.redirect("/client/therapy-reports");
    }

    const appointment = await AppointmentModel.findOne({
      _id: report.sessionId,
      patientId: patient._id,
    }).populate("therapistId", "firstName lastName profilePicture");

    if (!appointment) {
      req.flash("error", "Unauthorized access to report");
      return res.redirect("/client/therapy-reports");
    }

    res.render("patient/therapy-report-view", {
      patient,
      report,
      therapistName: `${appointment.therapistId.firstName} ${appointment.therapistId.lastName}`,
      therapistProfilePicture:
        appointment.therapistId.profilePicture ||
        "/img/doctors/doctor-thumb-01.jpg",
      formattedDate: moment(report.timestamp).format("MMMM D, YYYY"),
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error fetching therapy report:", error);
    req.flash("error", "Error fetching therapy report");
    res.redirect("/client/therapy-reports");
  }
});

router.get("/therapist-profile/:id", isLoggedIn, async (req, res) => {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      req.flash("error", "Therapist not found");
      return res.redirect("/client/therapist-search");
    }
    console.log("Fetched therapist availability:", therapist.availability);

    res.render("patient/therapist-profile", {
      patient,
      therapist: therapist,
      availability: therapist.availability || [],
      messages: req.flash(),
    });
  } catch (error) {
    console.error(error);
    req.flash("error", "Error fetching therapist profile");
    res.redirect("/client/therapist-search");
  }
});

router.get("/therapist-booking/:id", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      req.flash("error", "Therapist not found");
      return res.redirect("/client/therapist-search");
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
      const dayAvailabilities = therapist.availability.filter(
        (slot) => slot.day === dateInfo.day
      );

      if (dayAvailabilities.length === 0) {
        return { ...dateInfo, slots: [] };
      }

      const slots = [];

      dayAvailabilities.forEach((dayAvailability) => {
        const [startHour, startMinute] = dayAvailability.startTime
          .split(":")
          .map(Number);
        const [endHour, endMinute] = dayAvailability.endTime
          .split(":")
          .map(Number);

        let currentHour = startHour;
        let currentMinute = startMinute;

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
              display: `${moment(slotStart, "HH:mm").format(
                "h:mm A"
              )} - ${moment(
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
      });

      return { ...dateInfo, slots };
    });

    res.render("patient/therapist-booking", {
      patient,
      therapist,
      weekDates,
      formattedAvailability,
      messages: req.flash(),
    });
  } catch (error) {
    console.error(error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/therapist-search");
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
          currentMinute = 60;
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
      req.flash("error", "Therapist not found");
      return res.redirect("/client/therapist-search");
    }

    const { day, date, time } = req.query;

    if (!day || !date || !time) {
      req.flash("error", "Missing booking parameters");
      return res.redirect(`/client/therapist-booking/${req.params.id}`);
    }

    const dateMoment = moment.tz(req.query.date, "YYYY-MM-DD", "Asia/Karachi");
    if (!dateMoment.isValid()) {
      req.flash("error", "Invalid date format");
      return res.redirect(`/client/therapist-booking/${req.params.id}`);
    }

    res.render("patient/checkout", {
      therapist,
      patient,
      selectedDay: day,
      selectedTime: time,
      selectedDate: dateMoment.format("YYYY-MM-DD"),
      messages: req.flash(),
    });
  } catch (error) {
    console.error(error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/therapist-search");
  }
});

router.post("/confirm-booking", isLoggedIn, async function (req, res) {
  try {
    const { therapistId, selectedDate, selectedTime, sessionType } = req.body;
    const patient = await patientModel.findOne({ email: req.user.email });
    const patientId = patient._id;

    if (!therapistId || !selectedDate || !selectedTime || !sessionType) {
      req.flash("error", "Missing required fields");
      return res.redirect("/client/therapist-search");
    }

    const appointmentMoment = moment.tz(
      `${selectedDate} ${selectedTime.split("-")[0].trim()}`,
      "YYYY-MM-DD HH:mm",
      "Asia/Karachi"
    );

    if (!appointmentMoment.isValid()) {
      req.flash("error", "Invalid date/time format");
      return res.redirect("/client/therapist-search");
    }

    const today = moment().tz("Asia/Karachi").startOf("day");
    if (appointmentMoment.isBefore(today)) {
      req.flash("error", "Cannot book appointments in the past");
      return res.redirect("/client/therapist-search");
    }

    const appointmentDate = new Date(appointmentMoment.format());
    const [startTime] = selectedTime.split("-");

    console.log("Booking Input:", {
      selectedDate,
      selectedTime,
      sessionType,
      appointmentDate: appointmentDate.toISOString(),
      time: startTime.trim(),
    });

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
      sessionType: sessionType.toLowerCase() || "video",
      status: "Scheduled",
    });

    await appointment.save();

    console.log("Saved Appointment:", {
      _id: appointment._id,
      date: appointment.date.toISOString(),
      time: appointment.time,
      sessionType: appointment.sessionType,
    });

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

    req.flash("success", "Booking confirmed successfully");
    res.redirect("/client/booking-success");
  } catch (error) {
    console.error("Booking error:", error);
    req.flash("error", "Error processing booking");
    res.redirect("/client/therapist-search");
  }
});

router.get("/booking-success", isLoggedIn, async function (req, res) {
  try {
    if (!req.session.appointmentId) {
      req.flash("error", "No booking found");
      return res.redirect("/client/dashboard");
    }

    const appointment = await AppointmentModel.findById(
      req.session.appointmentId
    )
      .populate("therapistId")
      .populate("patientId");

    if (!appointment) {
      req.flash("error", "Appointment not found");
      return res.redirect("/client/dashboard");
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
      messages: req.flash(),
    });

    delete req.session.appointmentId;
  } catch (error) {
    console.error(error);
    req.flash("error", "Error retrieving booking details");
    res.redirect("/client/dashboard");
  }
});

router.get("/pass-change", isLoggedIn, function (req, res) {
  res.render("patient/pass-change", { messages: req.flash() });
});

router.get("/profile", isLoggedIn, async function (req, res) {
  const patient = await patientModel.findOne({ email: req.user.email });
  res.render("patient/profile", { patient, messages: req.flash() });
});

router.post("/profile/update", isLoggedIn, async function (req, res) {
  try {
    const clientId = req.user._id;
    const updatedData = {
      firstname: req.body.firstName,
      lastname: req.body.lastName,
      dob: req.body.dob,
      email: req.body.email,
      mobile: req.body.mobile,
      city: req.body.city,
      country: req.body.country,
      updatedAt: new Date(),
    };

    await patientModel.findByIdAndUpdate(clientId, updatedData, { new: true });

    req.flash("success", "Profile updated successfully");
    res.redirect("/client/profile");
  } catch (err) {
    console.error(err);
    req.flash("error", "Error updating profile");
    res.redirect("/client/profile");
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
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/dashboard");
  }
});

router.get("/invoice/:id", isLoggedIn, async function (req, res) {
  try {
    const appointmentId = req.params.id;

    const appointment = await AppointmentModel.findById(appointmentId)
      .populate("therapistId")
      .populate("patientId");

    if (!appointment) {
      req.flash("error", "Appointment not found");
      return res.redirect("/client/invoices");
    }

    if (!appointment.patientId) {
      req.flash("error", "Patient details not found");
      return res.redirect("/client/invoices");
    }

    console.log("Appointment:", appointment);

    const transaction = await TransactionModel.findOne({
      appointment: appointmentId,
    });

    if (!transaction) {
      req.flash("error", "Transaction not found");
      return res.redirect("/client/invoices");
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
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/invoices");
  }
});

router.get("/accounts", isLoggedIn, async function (req, res) {
  try {
    const patient = await patientModel.findOne({ email: req.user.email });
    const patientId = patient._id;

    const transactions = await TransactionModel.find({
      patient: patientId,
      status: "cancelled",
    })
      .populate("therapist", "username")
      .populate("appointment", "date");

    const totalBalance = transactions
      .filter((txn) => txn.patientPayout === "not paid")
      .reduce((acc, txn) => acc + (txn.amount || 0), 0);

    const totalRequested = transactions
      .filter((txn) => txn.patientPayout === "requested")
      .reduce((acc, txn) => acc + (txn.amount || 0), 0);

    res.render("patient/accounts", {
      patient,
      transactions,
      totalBalance,
      totalRequested,
      messages: req.flash(),
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    req.flash("error", "Internal Server Error");
    res.redirect("/client/dashboard");
  }
});

router.post("/request-refund", isLoggedIn, async function (req, res) {
  try {
    const patientId = req.user._id;

    const unpaidTransactions = await TransactionModel.find({
      patient: patientId,
      status: "cancelled",
      patientPayout: "not paid",
    });

    if (unpaidTransactions.length === 0) {
      req.flash("error", "No eligible transactions available for refund");
      return res.redirect("/client/accounts");
    }

    await TransactionModel.updateMany(
      {
        patient: patientId,
        patientPayout: "not paid",
        status: "cancelled",
      },
      { patientPayout: "requested" }
    );
    req.flash("success", "Refund request submitted successfully");
    res.redirect("/client/accounts");
  } catch (error) {
    console.error("Error requesting refund:", error);
    req.flash("error", "Error processing refund request");
    res.redirect("/client/accounts");
  }
});

router.post("/request-refund/:id", isLoggedIn, async function (req, res) {
  try {
    const transactionId = req.params.id;
    const patientId = req.user._id;

    console.log("Transaction ID:", transactionId);
    console.log("Patient ID:", patientId);

    const transaction = await TransactionModel.findOne({
      _id: new mongoose.Types.ObjectId(transactionId),
      patient: new mongoose.Types.ObjectId(patientId),
      status: "cancelled",
      patientPayout: "not paid",
    });

    if (!transaction) {
      req.flash("error", "Transaction not found or not eligible for refund");
      console.log("Transaction not found with criteria:", {
        transactionId,
        patientId,
        status: "cancelled",
        patientPayout: "not paid",
      });
      return res.redirect("/client/accounts");
    }

    transaction.patientPayout = "requested";
    await transaction.save();

    req.flash("success", "Refund request submitted successfully");
    res.redirect("/client/accounts");
  } catch (error) {
    console.error("Error requesting refund:", error);
    req.flash("error", "Error processing refund request");
    res.redirect("/client/accounts");
  }
});

router.post("/update-bank-details", isLoggedIn, async (req, res) => {
  try {
    const patient = await patientModel.findById(req.user._id);
    patient.bankDetails = {
      accountNumber: req.body.accountNumber,
      bankName: req.body.bankName,
      branchName: req.body.branchName,
      accountName: req.body.accountName,
    };

    await patient.save();
    req.flash("success", "Bank details updated successfully");
    res.redirect("/client/accounts");
  } catch (error) {
    console.error("Error saving bank details:", error);
    req.flash("error", "Error saving bank details");
    res.redirect("/client/accounts");
  }
});

router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      req.flash("error", "Error logging out");
      return next(err);
    }
    res.clearCookie("patient.sid");
    req.flash("success", "Successfully logged out");
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return next(err);
      }
      res.redirect("/client/login");
    });
  });
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    console.log("Authenticated user ID:", req.user._id.toString());
    return next();
  }
  req.flash("error", "Please log in to access this page");
  res.redirect("/client/login");
}

module.exports = router;
