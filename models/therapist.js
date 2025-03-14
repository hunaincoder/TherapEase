const mongoose = require("mongoose");
const plm = require("passport-local-mongoose");

const TherapistSchema = new mongoose.Schema({
  googleID: { type: String, parse: true },
  username: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  dateOfBirth: { type: Date },
  city: { type: String },
  state: { type: String },
  profilePicture: { type: String },
  bio: { type: String },
  clinicName: { type: String },
  clinicAddress: { type: String },
  specialties: [String], 
  services: [String],
  education: [
    {
      degree: { type: String },
      college: { type: String },
      yearOfCompletion: { type: String },
    },
  ],
  experience: [
    {
      clinicExperience: { type: String },
      from: { type: Date },
      to: { type: Date },
      designation: { type: String },
    },
  ],
  awards: [
    {
      name: { type: String },
      year: { type: String },
    },
  ],
  certifications: [String],
  badge: { type: Number, enum: [1, 2, 3] },
  availability: [
    {
      day: { type: String, required: true },
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
    },
  ],
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TherapistSchema.plugin(plm, { usernameField: "email" });
module.exports = mongoose.model("Therapist", TherapistSchema);
