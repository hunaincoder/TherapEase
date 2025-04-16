const mongoose = require("mongoose");
const plm = require("passport-local-mongoose");

const PatientSchema = new mongoose.Schema({
  username: { type: String, required: true },
  firstname: { type: String },
  lastname: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  googleID: { type: String },
  phone: { type: String },
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  dob: { type: Date },
  city: { type: String },
  country: { type: String },
  mobile: { type: String },
  age: { type: Number },
  address: { type: String },

  appointments: [
    {
      therapistId: { type: mongoose.Schema.Types.ObjectId, ref: "Therapist" },
      date: { type: Date },
      time: { type: String },
      sessionType: { type: String },
      status: { type: String, default: "Scheduled" },
    },
  ],

  bankDetails: {
    bankName: { type: String },
    branchName: { type: String },
    accountNumber: { type: String },
    accountName: { type: String },
  },

  pastAppointments: [
    {
      therapistId: { type: mongoose.Schema.Types.ObjectId, ref: "Therapist" },
      date: { type: Date },
      feedback: { type: String },
      rating: { type: Number },
    },
  ],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PatientSchema.plugin(plm, { usernameField: "email" });

module.exports = mongoose.model("Patient", PatientSchema);
