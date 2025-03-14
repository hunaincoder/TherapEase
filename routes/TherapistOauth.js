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
  }),
  async (req, res) => {
    try {
      console.log("Google OAuth callback triggered");
      const therapist = await TherapistModel.findById(req.user._id);
      if (!therapist) {
        console.error("Therapist not found in database");
        return res.status(404).send("Therapist not found");
      }

      const isProfileComplete =
        therapist.firstName &&
        therapist.lastName &&
        therapist.specialties &&
        therapist.specialties.length > 0;

      if (therapist.status === "Rejected") {
        console.log("Therapist account rejected");
        req.logout(() => {});
        return res.status(403).send("Your account has been rejected");
      }

      if (!isProfileComplete && therapist.status === "Pending") {
        console.log("Redirecting to profile setup");
        return res.redirect("/therapist/profile-setup");
      }

      if (therapist.status !== "Approved") {
        console.log(
          "Therapist not approved, showing registration complete page"
        );
        req.logout(() => {});
        return res.render("therapist/registration-complete");
      }

      console.log("Therapist logged in successfully");
      req.session.therapist = {
        id: therapist._id,
        email: therapist.email,
        status: therapist.status,
      };

      res.redirect("/therapist/dashboard");
    } catch (error) {
      console.error("Error in Google OAuth callback:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

module.exports = router;
