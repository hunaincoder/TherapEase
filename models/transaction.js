const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  therapist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Therapist",
    required: true,
  },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
    required: true,
  },
  amount: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  paymentMethod: String,
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  invoiceNumber: String,
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);
