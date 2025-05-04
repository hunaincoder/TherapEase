const passport = require("passport");
const express = require("express");
const router = express.Router();
const googleStrategy = require("passport-google-oauth20").Strategy;
const TherapistModel = require("../models/therapist");

passport.use(
  "therapist-google",
  new googleStrategy(
    {
      clientID: process.env.THERAPIST_OAUTH_ID,
      clientSecret: process.env.THERAPIST_OAUTH_SECRET,
      callbackURL: "http://localhost:3000/therapist/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let therapist = await TherapistModel.findOne({ googleID: profile.id });

        if (!therapist) {
          therapist = new TherapistModel({
            username: profile.displayName,
            email: profile.emails[0].value,
            googleID: profile.id,
            status: "Pending",
          });
          await therapist.save();
        }

        return done(null, therapist);
      } catch (error) {
        console.error("Error during therapist Google authentication:", error);
        return done(error, false);
      }
    }
  )
);

router.get(
  "/auth/google",
  passport.authenticate("therapist-google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("therapist-google", {
    failureRedirect: "/therapist/login",
    failureFlash: true,
  }),
  async (req, res, next) => {
    try {
      const therapist = await TherapistModel.findById(req.user._id);
      if (!therapist) {
        req.flash("error", "Therapist not found");
        return res.redirect("/therapist/login");
      }

      if (therapist.status === "Rejected") {
        req.logout((err) => {
          if (err) console.error("Error logging out:", err);
        });
        req.flash("error", "Your account has been rejected");
        return res.redirect("/therapist/login");
      }

      const isProfileComplete =
        therapist.firstName &&
        therapist.lastName &&
        therapist.specialties &&
        therapist.specialties.length > 0;

      if (!isProfileComplete && therapist.status === "Pending") {
        req.flash("info", "Please complete your profile setup");
        req.session.save((err) => {
          if (err) {
            console.error("Error saving session:", err);
            req.flash("error", "Failed to save session");
            return res.redirect("/therapist/login");
          }
          res.redirect("/therapist/profile-setup");
        });
        return;
      }

      if (therapist.status !== "Approved") {
        req.logout((err) => {
          if (err) console.error("Error logging out:", err);
        });
        req.flash("info", "Your account is pending approval");
        return res.render("therapist/registration-complete");
      }

      req.flash("success", "Successfully logged in");
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session:", err);
          req.flash("error", "Failed to save session");
          return res.redirect("/therapist/login");
        }
        res.redirect("/therapist/dashboard");
      });
    } catch (error) {
      console.error("Error in Google OAuth callback:", error);
      req.flash("error", "Internal Server Error");
      res.redirect("/therapist/login");
    }
  }
);

module.exports = router;
