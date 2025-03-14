const mongoose = require("mongoose");
const passport = require("passport");
const plm = require("passport-local-mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/TherapEase");

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String},
  googleID: { type: String, unique: true },
  firstName: { type: String },
  lastName: { type: String },
  dob: { type: Date },
  mobile: { type: String },
  description : { type: String },
  activityLog: [
    {
      action: { type: String },
      timestamp: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});



AdminSchema.plugin(plm,  { usernameField: 'email' });
module.exports = mongoose.model('Admin', AdminSchema);