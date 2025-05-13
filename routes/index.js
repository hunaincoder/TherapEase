var express = require("express");
var router = express.Router();
const authRoutes = require("./OAuth");
const AdminModel = require("../models/admin");
const passport = require("passport");
const localStrategy = require("passport-local");
const TherapistModel = require("../models/therapist");
const PatientModel = require("../models/patient");
const TransactionModel = require("../models/transaction");
const AppointmentModel = require("../models/appointments");
const moment = require("moment");
const mongoose = require("mongoose");
const flash = require("connect-flash");

router.use("/", authRoutes);

passport.use(
  "admin-local",
  new localStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async function (email, password, done) {
      try {
        const admin = await AdminModel.findOne({ email });
        if (!admin) {
          return done(null, false, { message: "Invalid email or password" });
        }
        admin.authenticate(password, function (err, user, passwordErr) {
          if (err || passwordErr) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        });
      } catch (err) {
        return done(err);
      }
    }
  )
);

router.get("/", async function (req, res) {
  try {
    const therapist = await TherapistModel.find({ status: "Approved" })
      .limit(4)
      .select(
        "username firstName lastName specialties fee profilePicture badge availability"
      );

    const formattedTherapist = therapist.map((therapist) => ({
      ...therapist._doc,
      availabilityText:
        therapist.availability.length > 0
          ? `Available ${therapist.availability[0].day} (${therapist.availability[0].startTime} - ${therapist.availability[0].endTime})`
          : "Availability TBD",
    }));

    res.render("index", { therapists: formattedTherapist });
  } catch (error) {
    console.error("Error fetching therapists for homepage:", error);
    res.render("index", { therapists: [] });
  }
});

router.get("/dashboard", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });

    const therapistCount = await TherapistModel.countDocuments();
    const patientCount = await PatientModel.countDocuments();
    const appointmentCount = await AppointmentModel.countDocuments();

    const revenueResult = await TransactionModel.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    const latestTherapists = await TherapistModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("username specialties fee profilePicture badge");

    const latestPatients = await PatientModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("username mobile updatedAt");

    const latestAppointments = await AppointmentModel.find()
      .populate("patientId", "firstname lastname")
      .populate("therapistId", "username specialties profilePicture")
      .sort({ date: -1 })
      .limit(5);

    const revenueData = await TransactionModel.aggregate([
      {
        $match: {
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

    res.render("admin/dashboard", {
      admin,
      appointmentData,
      revenueData,
      counts: {
        therapists: therapistCount,
        patients: patientCount,
        appointments: appointmentCount,
        revenue: totalRevenue,
      },
      latest: {
        therapists: latestTherapists,
        patients: latestPatients,
        appointments: latestAppointments.map((a) => ({
          ...a._doc,
          formattedDate: moment(a.date).format("DD MMM YYYY"),
          time: `${moment(a.time, "HH:mm").format("h:mm A")} - ${moment(
            a.time,
            "HH:mm"
          )
            .add(30, "minutes")
            .format("h:mm A")}`,
        })),
      },
    });
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error loading dashboard");
    res.redirect("/dashboard");
  }
});

router.get("/profile", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    res.render("admin/profile", { admin });
  } catch (err) {
    console.error(err);
    req.flash("errorMessage", "Error loading profile");
    res.redirect("/dashboard");
  }
});

router.post("/profile/update", isLoggedIn, async function (req, res) {
  try {
    const adminId = req.user._id;
    const updatedData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      dob: req.body.dob,
      email: req.body.email,
      mobile: req.body.mobile,
      updatedAt: new Date(),
    };
    await AdminModel.findByIdAndUpdate(adminId, updatedData);
    req.flash("successMessage", "Profile updated successfully!");
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    req.flash("errorMessage", "Error updating profile");
    res.redirect("/profile");
  }
});

router.get("/appointment-list", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const appointments = await AppointmentModel.find()
      .populate("patientId", "firstname lastname")
      .populate("therapistId", "username specialties fee profilePicture _id")
      .sort({ date: -1 });

    const formattedAppointments = appointments.map((appointment) => ({
      ...appointment._doc,
      formattedDate: moment(appointment.date).format("DD MMM YYYY"),
      timeRange: `${moment(appointment.time, "HH:mm").format(
        "h:mm A"
      )} - ${moment(appointment.time, "HH:mm")
        .add(30, "minutes")
        .format("h:mm A")}`,
    }));

    res.render("admin/appointment-list", {
      admin,
      appointments: formattedAppointments,
    });
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error fetching appointments");
    res.redirect("/dashboard");
  }
});

router.get("/therapist-list", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const therapists = await TherapistModel.find({ status: "Approved" });
    therapists.forEach((therapist) => {
      therapist.formattedDate = therapist.createdAt.toLocaleDateString(
        "en-US",
        {
          weekday: "short",
          day: "numeric",
          month: "short",
        }
      );
    });
    res.render("admin/therapist-list", { admin, therapists });
  } catch (error) {
    console.error("Error in /therapist-list:", error.stack);
    req.flash("errorMessage", "Error fetching therapist list");
    res.redirect("/dashboard");
  }
});

router.post("/delete-therapist/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedtherapist = await TherapistModel.findByIdAndDelete(id);
    if (!deletedtherapist) {
      req.flash("errorMessage", "Therapist not found");
      return res.redirect("/therapist-list");
    }
    req.flash("successMessage", "Therapist deleted successfully!");
    res.redirect("/therapist-list");
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error deleting therapist");
    res.redirect("/therapist-list");
  }
});

router.get("/therapist-profile/:id", isLoggedIn, async (req, res) => {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      req.flash("errorMessage", "Therapist not found");
      return res.redirect("/therapist-list");
    }

    res.render("admin/therapist-profile", {
      admin,
      therapist: therapist,
      availability: therapist.availability || [],
    });
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error fetching therapist profile");
    res.redirect("/therapist-list");
  }
});

router.get("/patient-list", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const patients = await PatientModel.find();

    res.render("admin/patient-list", { admin, patients });
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error fetching patient list");
    res.redirect("/dashboard");
  }
});

router.post("/delete-patient/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedpatient = await PatientModel.findByIdAndDelete(id);
    if (!deletedpatient) {
      req.flash("errorMessage", "Patient not found");
      return res.redirect("/patient-list");
    }
    req.flash("successMessage", "Patient deleted successfully!");
    res.redirect("/patient-list");
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error deleting patient");
    res.redirect("/patient-list");
  }
});

router.get("/transactions-list", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const transactions = await TransactionModel.find()
      .populate("patient")
      .populate("therapist")
      .populate("appointment");

    res.render("admin/transactions-list", { admin, transactions });
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error fetching transactions");
    res.redirect("/dashboard");
  }
});

router.post("/delete-transaction/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await TransactionModel.findByIdAndDelete(id);
    req.flash("successMessage", "Transaction deleted successfully!");
    res.redirect("/transactions-list");
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error deleting transaction");
    res.redirect("/transactions-list");
  }
});

router.get("/invoice/:id", isLoggedIn, async (req, res) => {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });

    const transaction = await TransactionModel.findById(req.params.id)
      .populate("patient")
      .populate("therapist")
      .populate("appointment");

    if (!transaction) {
      req.flash("errorMessage", "Transaction not found");
      return res.redirect("/transactions-list");
    }

    if (
      !transaction.patient ||
      !transaction.therapist ||
      !transaction.appointment
    ) {
      req.flash("errorMessage", "Incomplete transaction data");
      return res.redirect("/transactions-list");
    }

    res.render("admin/invoice", {
      transaction: {
        ...transaction._doc,
        totalAmount: transaction.amount + transaction.tax,
      },
      patient: transaction.patient,
      therapist: transaction.therapist,
      admin: admin,
      appointment: {
        sessionType: transaction.appointment.sessionType,
        date: moment(transaction.appointment.date).format("MMMM Do, YYYY"),
        time: moment(transaction.appointment.time, "HH:mm").format("h:mm A"),
      },
    });
  } catch (error) {
    console.error("Invoice Error:", error);
    req.flash("errorMessage", "Error generating invoice");
    res.redirect("/transactions-list");
  }
});

router.get("/therapist-approval", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const therapists = await TherapistModel.find({ status: "Pending" });

    res.render("admin/therapist-approval", { therapists, admin });
  } catch (err) {
    console.error("Error fetching therapist approval list:", err);
    req.flash("errorMessage", "Error fetching therapist list");
    res.redirect("/dashboard");
  }
});

router.post("/approve-therapist/:id", isLoggedIn, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("errorMessage", "Invalid therapist ID");
      return res.redirect("/therapist-approval");
    }

    const therapist = await TherapistModel.findById(id);
    if (!therapist) {
      req.flash("errorMessage", "Therapist not found");
      return res.redirect("/therapist-approval");
    }

    therapist.status = "Approved";
    await therapist.save();

    req.flash("successMessage", "Therapist approved successfully!");
    res.redirect("/therapist-approval");
  } catch (error) {
    console.error("Error approving therapist:", error);
    req.flash("errorMessage", `Error approving therapist: ${error.message}`);
    res.redirect("/therapist-approval");
  }
});

router.post("/reject-therapist/:id", isLoggedIn, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("errorMessage", "Invalid therapist ID");
      return res.redirect("/therapist-approval");
    }

    const therapist = await TherapistModel.findById(id);
    if (!therapist) {
      req.flash("errorMessage", "Therapist not found");
      return res.redirect("/therapist-approval");
    }

    therapist.status = "Rejected";
    await therapist.save();

    req.flash("successMessage", "Therapist rejected successfully!");
    res.redirect("/therapist-approval");
  } catch (error) {
    console.error("Error rejecting therapist:", error);
    req.flash("errorMessage", `Error rejecting therapist: ${error.message}`);
    res.redirect("/therapist-approval");
  }
});

router.get("/therapy-reports", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const reports = await mongoose.connection.db
      .collection("after_therapy_reports")
      .find()
      .toArray();

    const populatedReports = await Promise.all(
      reports.map(async (report) => {
        const appointment = await AppointmentModel.findById(report.sessionId)
          .populate("patientId", "firstname lastname")
          .populate("therapistId", "firstName lastName");

        return {
          ...report,
          patientName: appointment?.patientId
            ? `${appointment.patientId.firstname} ${appointment.patientId.lastname}`
            : "Unknown",
          therapistName: appointment?.therapistId
            ? `${appointment.therapistId.firstName} ${appointment.therapistId.lastName}`
            : "Unknown",
        };
      })
    );

    res.render("admin/therapy-reports", {
      admin,
      reports: populatedReports,
      successMessage: req.flash("successMessage"),
      errorMessage: req.flash("errorMessage"),
    });
  } catch (error) {
    console.error("Error fetching therapy reports:", error);
    req.flash("errorMessage", "Error fetching therapy reports");
    res.redirect("/dashboard");
  }
});

router.get("/therapy-reports/:id", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const report = await mongoose.connection.db
      .collection("after_therapy_reports")
      .findOne({
        _id: new mongoose.Types.ObjectId(req.params.id),
      });

    if (!report) {
      req.flash("errorMessage", "Report not found");
      return res.redirect("/therapy-reports");
    }

    const appointment = await AppointmentModel.findById(report.sessionId)
      .populate("patientId", "firstname lastname")
      .populate("therapistId", "firstName lastName");

    res.render("admin/therapy-report-view", {
      admin,
      report,
      patientName: appointment?.patientId
        ? `${appointment.patientId.firstname} ${appointment.patientId.lastname}`
        : "Unknown",
      therapistName: appointment?.therapistId
        ? `${appointment.therapistId.firstName} ${appointment.therapistId.lastName}`
        : "Unknown",
      successMessage: req.flash("successMessage"),
      errorMessage: req.flash("errorMessage"),
    });
  } catch (error) {
    console.error("Error fetching therapy report:", error);
    req.flash("errorMessage", "Error fetching therapy report");
    res.redirect("/therapy-reports");
  }
});

router.get("/client-profile/:id", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const patient = await PatientModel.findById(req.params.id);

    if (!patient) {
      req.flash("errorMessage", "Patient not found");
      return res.redirect("/patient-list");
    }

    res.render("admin/patient-profile", {
      admin,
      patient: patient,
      successMessage: req.flash("successMessage"),
      errorMessage: req.flash("errorMessage"),
    });
  } catch (error) {
    console.error("Error fetching patient profile:", error);
    req.flash("errorMessage", "Error fetching patient profile");
    res.redirect("/patient-list");
  }
});

router.get("/payment-approval", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });

    const transactions = await TransactionModel.find({
      therapistPayout: "requested",
    })
      .populate("therapist", "username profilePicture bankDetails")
      .populate("patient", "username firstname lastname");

    res.render("admin/payment-approval", { admin, transactions });
  } catch (error) {
    console.error(error);
    req.flash("errorMessage", "Error fetching payment approval list");
    res.redirect("/dashboard");
  }
});

router.post("/approve-payment/:id", isLoggedIn, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      req.flash("errorMessage", "Transaction not found");
      return res.redirect("/payment-approval");
    }

    transaction.therapistPayout = "paid";
    transaction.datePaid = new Date();
    await transaction.save();

    req.flash("successMessage", "Payment approved successfully!");
    res.redirect("/payment-approval");
  } catch (error) {
    console.error("Error approving payment:", error);
    req.flash("errorMessage", "Error approving payment");
    res.redirect("/payment-approval");
  }
});

router.post("/reject-payment/:id", isLoggedIn, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      req.flash("errorMessage", "Transaction not found");
      return res.redirect("/payment-approval");
    }

    transaction.therapistPayout = "rejected";
    transaction.datePaid = new Date();
    await transaction.save();

    req.flash("successMessage", "Payment rejected successfully!");
    res.redirect("/payment-approval");
  } catch (error) {
    console.error("Error rejecting payment:", error);
    req.flash("errorMessage", "Error rejecting payment");
    res.redirect("/payment-approval");
  }
});

router.get("/refunds-approval", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });

    const transactions = await TransactionModel.find({
      patientPayout: "requested",
    })
      .populate("therapist", "username profilePicture bankDetails")
      .populate("patient", "username firstname lastname bankDetails");

    res.render("admin/refunds-approval", { admin, transactions });
  } catch (error) {
    console.error("Error fetching refunds approval list:", error);
    req.flash("errorMessage", "Error fetching refunds approval list");
    res.redirect("/dashboard");
  }
});

router.post("/approve-refund/:id", isLoggedIn, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      req.flash("errorMessage", "Transaction not found");
      return res.redirect("/refunds-approval");
    }

    transaction.patientPayout = "refunded";
    transaction.datePaid = new Date();
    await transaction.save();

    req.flash("successMessage", "Refund approved successfully!");
    res.redirect("/refunds-approval");
  } catch (error) {
    console.error("Error approving refund:", error);
    req.flash("errorMessage", "Error approving refund");
    res.redirect("/refunds-approval");
  }
});

router.post("/reject-refund/:id", isLoggedIn, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      req.flash("errorMessage", "Transaction not found");
      return res.redirect("/refunds-approval");
    }

    transaction.patientPayout = "rejected";
    transaction.datePaid = new Date();
    await transaction.save();

    req.flash("successMessage", "Refund rejected successfully!");
    res.redirect("/refunds-approval");
  } catch (error) {
    console.error("Error rejecting refund:", error);
    req.flash("errorMessage", "Error rejecting refund");
    res.redirect("/refunds-approval");
  }
});

router.post("/change-password", isLoggedIn, async function (req, res) {
  try {
    const adminId = req.user._id;
    const { oldpass, newpass, confirmpass } = req.body;
    const admin = await AdminModel.findById(adminId);

    if (!oldpass || !newpass || !confirmpass) {
      req.flash("errorMessage", "Please fill all fields");
      return res.redirect("/profile");
    }
    if (newpass !== confirmpass) {
      req.flash(
        "errorMessage",
        "New Password and Confirm Password do not match"
      );
      return res.redirect("/profile");
    }

    if (!admin) {
      req.flash("errorMessage", "Admin not found");
      return res.redirect("/profile");
    }

    admin.authenticate(oldpass, async function (err, user, passwordError) {
      if (err || passwordError) {
        req.flash("errorMessage", "Old Password is incorrect");
        return res.redirect("/profile");
      }

      await admin.setPassword(newpass);
      await admin.save();
      req.flash("successMessage", "Password changed successfully!");
      res.redirect("/profile");
    });
  } catch (err) {
    console.error(err);
    req.flash("errorMessage", "Error changing password");
    res.redirect("/profile");
  }
});

router.get("/login", function (req, res) {
  res.render("admin/login", {
    message: req.flash("errorMessage") || "Login failed, try again.",
  });
});

router.get("/register", function (req, res) {
  res.render("admin/register");
});

router.post("/register", async function (req, res) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    req.flash("errorMessage", "All fields are required");
    return res.redirect("/register");
  }

  const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailPattern.test(email)) {
    req.flash("errorMessage", "Invalid email format");
    return res.redirect("/register");
  }

  const existingUser = await AdminModel.findOne({ email });
  if (existingUser) {
    req.flash("errorMessage", "Email is already in use");
    return res.redirect("/register");
  }

  const data = new AdminModel({
    username: req.body.username,
    email: req.body.email,
  });

  AdminModel.register(data, req.body.password)
    .then(function () {
      passport.authenticate("admin-local")(req, res, function () {
        req.flash("successMessage", "Admin registered successfully!");
        res.redirect("/dashboard");
      });
    })
    .catch(function (err) {
      console.error(err);
      req.flash("errorMessage", "Error registering admin");
      res.redirect("/register");
    });
});

router.post("/login", function (req, res, next) {
  passport.authenticate("admin-local", function (err, user, info) {
    if (err) {
      req.flash("errorMessage", "Authentication error");
      return res.redirect("/login");
    }
    if (!user) {
      req.flash("errorMessage", "Invalid email or password");
      return res.redirect("/login");
    }

    req.login(user, function (err) {
      if (err) {
        req.flash("errorMessage", "Login failed");
        return res.redirect("/login");
      }
      req.session.save((err) => {
        if (err) {
          req.flash("errorMessage", "Session save error");
          return res.redirect("/login");
        }
        req.flash("successMessage", "Logged in successfully!");
        return res.redirect("/dashboard");
      });
    });
  })(req, res, next);
});

router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      req.flash("errorMessage", "Error during logout");
      return res.redirect("/dashboard");
    }
    res.clearCookie("admin.sid");
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.redirect("/dashboard");
      }
      res.redirect("/login");
    });
  });
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash("errorMessage", "Please log in to access this page");
  res.redirect("/login");
}

module.exports = router;
