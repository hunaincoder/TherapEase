const passport = require("passport");
const express = require("express");
const router = express.Router();
const googleStrategy = require("passport-google-oauth20").Strategy;
const patientModel = require("../models/patient");

passport.use(
  "patient-google",
  new googleStrategy(
    {
      clientID: process.env.PATIENT_OAUTH_ID,
      clientSecret: process.env.PATIENT_OAUTH_SECRET,
      callbackURL: "http://localhost:3000/client/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let patient = await patientModel.findOne({ googleID: profile.id });

        if (!patient) {
          patient = new patientModel({
            username: profile.displayName,
            email: profile.emails[0].value,
            googleID: profile.id,
          });
          await patient.save();
        }

        return done(null, patient);
      } catch (error) {
        console.error("Error during patient Google authentication:", error);
        return done(error, false);
      }
    }
  )
);

router.get(
  "/auth/google",
  passport.authenticate("patient-google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("patient-google", {
    failureRedirect: "/client/login",
    failureFlash: true,
  }),
  (req, res, next) => {
    req.flash("success", "Successfully logged in");
    req.session.save((err) => {
      if (err) {
        console.error("Error saving session:", err);
        req.flash("error", "Failed to save session");
        return res.redirect("/client/login");
      }
      if (!req.user.hasCompletedScreening) {
        return res.redirect("/client/screening");
      }
      res.redirect("/client/dashboard");
    });
  }
);

module.exports = router;
