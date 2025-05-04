const passport = require("passport");
const express = require("express");
const router = express.Router();
const googlestrategy = require("passport-google-oauth20").Strategy;
const adminModel = require("../models/admin");

passport.use(
  "admin-google",
  new googlestrategy(
    {
      clientID: process.env.ADMIN_OAUTH_ID,
      clientSecret: process.env.ADMIN_OAUTH_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let admin = await adminModel.findOne({
          $or: [{ email: profile.emails[0].value }, { googleID: profile.id }],
        });
        if (!admin) {
          admin = new adminModel({
            username: profile.displayName,
            email: profile.emails[0].value,
            googleID: profile.id,
          });
          await admin.save();
        }

        return done(null, admin);
      } catch (error) {
        console.error("Error during admin Google authentication:", error);
        return done(error, false);
      }
    }
  )
);

router.get(
  "/auth/google",
  passport.authenticate("admin-google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("admin-google", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, res, next) => {
    req.flash("success", "Successfully logged in");
    req.session.save((err) => {
      if (err) {
        console.error("Error saving session:", err);
        req.flash("error", "Failed to save session");
        return res.redirect("/login");
      }
      res.redirect("/dashboard");
    });
  }
);

module.exports = router;
