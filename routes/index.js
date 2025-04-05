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

router.get("/", function (req, res) {
  res.render("index");
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
    res.status(500).send("Error loading dashboard");
  }
});

router.get("/profile", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    res.render("admin/profile", { admin });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
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

    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
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
    res.status(500).send("Error fetching appointments");
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
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/delete-therapist/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedtherapist = await TherapistModel.findByIdAndDelete(id);
    if (!deletedtherapist) {
      return res.status(404).send("Therapist not found");
    }
    req.flash("successMessage", "Therapist deleted successfully!");

    res.redirect("/therapist-list");
  } catch {
    console.error(error);
    res.status(500).send("Error deleting therapist");
  }
});

router.get("/therapist-profile/:id", isLoggedIn, async (req, res) => {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const therapist = await TherapistModel.findById(req.params.id);

    if (!therapist) {
      return res.status(404).send("Therapist not found");
    }

    res.render("admin/therapist-profile", {
      admin,
      therapist: therapist,
      availability: therapist.availability || [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching therapist profile");
  }
});

router.get("/patient-list", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const patients = await PatientModel.find();

    res.render("admin/patient-list", { admin, patients });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching patient list");
  }
});

router.post("/delete-patient/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedpatient = await PatientModel.findByIdAndDelete(id);
    if (!deletedpatient) {
      return res.status(404).send("patient not found");
    }
    req.flash("successMessage", "patient deleted successfully!");

    res.redirect("/patient-list");
  } catch {
    console.error(error);
    res.status(500).send("Error deleting patient");
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
    res.status(500).send("Error fetching transactions");
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
    res.status(500).send("Error deleting transaction");
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
      return res.status(404).send("Transaction not found");
    }

    if (
      !transaction.patient ||
      !transaction.therapist ||
      !transaction.appointment
    ) {
      return res.status(400).send("Incomplete transaction data");
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
    res.status(500).send("Error generating invoice");
  }
});

router.get("/therapist-approval", isLoggedIn, async function (req, res) {
  try {
    const admin = await AdminModel.findOne({ email: req.user.email });
    const therapists = await TherapistModel.find({ status: "Pending" });

    res.render("admin/therapist-approval", { therapists, admin });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching therapist list");
  }
});

router.post("/approve-therapist/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const therapist = await TherapistModel.findById(id);
    if (therapist) {
      therapist.status = "Approved";
      await therapist.save();
      res.redirect("/therapist-approval");
    } else {
      res.status(404).send("Therapist not found");
    }
  } catch (error) {
    res.status(500).send("Error approving therapist");
  }
});

router.post("/reject-therapist/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const therapist = await TherapistModel.findById(id);
    if (therapist) {
      therapist.status = "Rejected";
      await therapist.save();
      res.redirect("/therapist-approval");
    } else {
      res.status(404).send("Therapist not found");
    }
  } catch (error) {
    res.status(500).send("Error approving therapist");
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
  } catch (error) {}
});

router.post("/approve-payment/:id", isLoggedIn, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      res.status(404).send("Transaction not found");
    }

    transaction.therapistPayout = "paid";
    transaction.datePaid = new Date();
    await transaction.save();

    res.redirect("/payment-approval");
  } catch (error) {
    console.error("Error approving payment:", error);
    res.status(500).send("Error approving payment");
  }
});

router.post("/reject-payment/:id", isLoggedIn, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      res.status(404).send("Transaction not found");
    }

    transaction.therapistPayout = "rejected";
    transaction.datePaid = new Date();
    await transaction.save();

    res.redirect("/payment-approval");
  } catch (error) {
    console.error("Error rejecting payment:", error);
    res.status(500).send("Error approving payment");
  }
});

router.post("/change-password", isLoggedIn, async function (req, res) {
  try {
    const adminId = req.user._id;
    const { oldpass, newpass, confirmpass } = req.body;
    const admin = await AdminModel.findById(adminId);

    if (!oldpass || !newpass || !confirmpass) {
      return res.status(400).send("Please fill all fields");
    }
    if (newpass !== confirmpass) {
      return res
        .status(400)
        .send("New Password and Confirm Password do not match");
    }

    if (!admin) {
      return res.status(404).send("Admin not found");
    }

    admin.authenticate(oldpass, async function (err, user, passwordError) {
      if (err || passwordError) {
        return res.status(400).send("Old Password is incorrect");
      }

      await admin.setPassword(newpass);
      await admin.save();
    });

    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error changing password");
  }
});

router.get("/login", function (req, res) {
  res.render("admin/login", { message: "Login failed, try again." });
});

router.get("/register", function (req, res) {
  res.render("admin/register");
});

router.post("/register", async function (req, res) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).send("All fields are required");
  }

  const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailPattern.test(email)) {
    return res.status(400).send("Invalid email format");
  }

  const existingUser = await AdminModel.findOne({ email });
  if (existingUser) {
    return res.status(400).send("Email is already in use");
  }

  const data = new AdminModel({
    username: req.body.username,
    email: req.body.email,
  });

  AdminModel.register(data, req.body.password)
    .then(function () {
      passport.authenticate("admin-local")(req, res, function () {
        res.redirect("/dashboard");
      });
    })
    .catch(function (err) {
      console.error(err);
      res.status(500).send("Error registering admin");
    });
});

router.post("/login", function (req, res, next) {
  passport.authenticate("admin-local", function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(400).send("Invalid email or password");
    }

    req.login(user, function (err) {
      if (err) {
        return next(err);
      }
      req.session.save((err) => {
        if (err) {
          return next(err);
        }
        return res.redirect("/dashboard");
      });
    });
  })(req, res, next);
});

router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }

    res.clearCookie("connect.sid");

    req.session.destroy((err) => {
      if (err) return next(err);
      res.redirect("/login");
    });
  });
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated() && !req.user.status) {
    return next();
  }
  res.redirect("/login");
}

module.exports = router;
