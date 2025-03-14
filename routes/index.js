var express = require("express");
var router = express.Router();
const authRoutes = require("./OAuth");
const AdminModel = require("../models/admin");
const passport = require("passport");
const localStrategy = require("passport-local");
const TherapistModel = require("../models/therapist");
const PatientModel = require("../models/patient");

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
  const admin = await AdminModel.findOne({ email: req.user.email });

  res.render("admin/dashboard", { admin });
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
  const admin = await AdminModel.findOne({ email: req.user.email });

  res.render("admin/appointment-list", { admin });
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
  const admin = await AdminModel.findOne({ email: req.user.email });
  res.render("admin/transactions-list", { admin });
});

router.get("/invoice", isLoggedIn, async function (req, res) {
  const admin = await AdminModel.findOne({ email: req.user.email });

  res.render("admin/invoice", { admin });
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
  const admin = await AdminModel.findOne({ email: req.user.email });
  res.render("admin/payment-approval", { admin });
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
