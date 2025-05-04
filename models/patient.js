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

  name: { type: String },
  occupation: { type: String },
  maritalStatus: {
    type: String,
    enum: ["Single", "Married", "Divorced", "Widowed"],
  },
  familyStructure: { type: String, enum: ["Nuclear", "Joint"] },
  headOfFamily: { type: String },
  headOfFamilyContact: { type: String },

  therapyProfile: {
    primary_concern: { type: String },
    impact: { type: String },
    past_experiences: { type: String },
    emotional_state: { type: String },
    behavior_patterns: { type: String },
    therapy_history: { type: String },
    support_system: { type: String },
    therapy_goals: { type: String },
    therapist_preferences: { type: String },
  },

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

  hasCompletedScreening: { type: Boolean, default: false },
  recommendedScale: { type: String },
  rationale: { type: String },

  scaleResults: {
    type: Map,
    of: {
      totalScore: { type: Number },
      severity: { type: String },
      badge: { type: String },
    },
    default: {},
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PatientSchema.plugin(plm, { usernameField: "email" });

module.exports = mongoose.model("Patient", PatientSchema);
